import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresGoogleLinkStore } from "../src/composition/bootstrap/google-link.js";
import { PostgresUserStore } from "../src/composition/bootstrap/user.js";

const provider = "line:test";
const alice = `U${"1".repeat(32)}`;
const bob = `U${"2".repeat(32)}`;
async function fixture() {
  const fixture = await postgresFixture();
  const users = new PostgresUserStore(fixture.db, { async protectPermissionAdministrator() {} });
  const user = await users.registerLine(provider, alice, "alice", 1);
  await users.registerLine(provider, bob, "bob", 1);
  const google = { id: randomUUID(), sub: "google-alice", email: "alice@example.test" };
  await fixture.pg.query("INSERT INTO auth.users(id,is_anonymous) VALUES($1,false)", [google.id]);
  return { ...fixture, users, user, google, links: new PostgresGoogleLinkStore(fixture.db) };
}

test("Google handoff freezes its proof, rejects other owners and commits explicit binding/unlink atomically", async (t) => {
  const { pg, users, user, google, links } = await fixture();
  t.after(() => pg.close());
  const { token } = await links.start(provider, alice, 100);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(
    (await pg.query<{ token_hash: string }>("SELECT token_hash FROM google_link_requests")).rows[0]
      ?.token_hash,
    token,
  );
  const pending = await links.pending(provider, alice, 101);
  assert.ok(pending);
  assert.equal(pending.expiresAt, 600100);
  assert.equal(pending.email, null);
  await assert.rejects(links.confirm(provider, alice, pending.id, 101), { status: 409 });
  await assert.rejects(links.confirm(provider, bob, pending.id, 101), { status: 410 });
  await links.cancel(provider, bob, pending.id);
  await assert.rejects(links.stage("invalid", google, 101), { status: 410 });
  await links.stage(token, google, 102);
  await links.stage(token, { ...google, email: "changed@example.test" }, 103);
  await assert.rejects(links.stage(token, { ...google, id: randomUUID() }, 103), { status: 409 });
  assert.equal((await links.pending(provider, alice, 104))?.email, google.email);
  await links.confirm(provider, alice, pending.id, 105);
  assert.equal((await users.get(user.id)).auth_user_id, google.id);
  assert.deepEqual(await users.googleIdentity(user.id), { sub: google.sub, email: google.email });
  assert.equal(await links.pending(provider, alice, 106), null);
  await assert.rejects(links.start(provider, alice, 106), { status: 409 });
  await links.unlink(provider, alice, 107);
  assert.equal((await users.get(user.id)).auth_user_id, null);
  assert.equal((await users.get(user.id)).status, "active");
  assert.equal(await users.googleIdentity(user.id), null);
  await assert.rejects(links.unlink(provider, alice, 108), { status: 409 });
  assert.deepEqual(
    (
      await pg.query(
        "SELECT type FROM user_events WHERE user_id=$1 AND type IN ('supabase_linked','google_unlinked') ORDER BY at",
        [user.id],
      )
    ).rows,
    [{ type: "supabase_linked" }, { type: "google_unlinked" }],
  );
});

test("expiry and User qualification epochs prevent an old Google handoff from being recovered", async (t) => {
  const { pg, users, user, google, links } = await fixture();
  t.after(() => pg.close());
  const expired = await links.start(provider, alice, 100);
  await assert.rejects(links.stage(expired.token, google, 600100), { status: 410 });
  const current = await links.start(provider, alice, 1_000_000);
  const pending = await links.pending(provider, alice, 1_000_001);
  assert.ok(pending);
  await users.pause(user.id);
  await assert.rejects(links.stage(current.token, google, 1_000_002), { status: 410 });
  await assert.rejects(links.pending(provider, alice, 1_000_002), { status: 403 });
  await users.restoreLine(provider, alice, 1_000_003);
  assert.equal(await links.pending(provider, alice, 1_000_004), null);
  await assert.rejects(links.stage(current.token, google, 1_000_004), { status: 410 });
  await assert.rejects(links.confirm(provider, alice, pending.id, 1_000_004), { status: 410 });
  await links.cancel(provider, alice, pending.id);
  assert.deepEqual((await pg.query("SELECT * FROM google_link_requests")).rows, []);
  assert.equal((await users.get(user.id)).auth_user_id, null);
});

test("confirmation failure rolls back the binding, audit and request deletion in one real transaction", async (t) => {
  const { pg, db, users, user, google, links } = await fixture();
  t.after(() => pg.close());
  const { token } = await links.start(provider, alice, 10);
  await links.stage(token, google, 11);
  const pending = await links.pending(provider, alice, 12);
  assert.ok(pending);
  let transactions = 0;
  const failing: Database = {
    transaction: (work) => {
      transactions += 1;
      return db.transaction((sql) =>
        work(
          createSql(async (text, values) => {
            const result = await sql.query(text, values);
            if (text === "DELETE FROM google_link_requests WHERE id=$1")
              throw new Error("request deletion failed");
            return result;
          }),
        ),
      );
    },
  };
  await assert.rejects(
    new PostgresGoogleLinkStore(failing).confirm(provider, alice, pending.id, 13),
    /request deletion failed/,
  );
  assert.equal(transactions, 1);
  assert.equal((await users.get(user.id)).auth_user_id, null);
  assert.equal(await users.googleIdentity(user.id), null);
  assert.equal((await links.pending(provider, alice, 14))?.id, pending.id);
  assert.deepEqual(
    (await pg.query("SELECT * FROM user_events WHERE type='supabase_linked'")).rows,
    [],
  );
  await links.confirm(provider, alice, pending.id, 15);
  assert.equal((await users.get(user.id)).auth_user_id, google.id);
  assert.equal(
    (await pg.query("SELECT * FROM user_events WHERE type='supabase_linked'")).rows.length,
    1,
  );
});
