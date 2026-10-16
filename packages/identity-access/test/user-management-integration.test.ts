import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { UserStatusCommand } from "@line_bot_v1/account/application/manage-users";
import { PostgresUserManagement } from "@line_bot_v1/account/postgres";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { hasPermission, protectPermissionAdministrator } from "../src/postgres.js";

const authorization = { hasPermission, protectPermissionAdministrator };
function command(action: UserStatusCommand["action"], expectedVersion: number): UserStatusCommand {
  return { requestId: randomUUID(), target: "target", action, expectedVersion, reason: "test" };
}
async function fixture() {
  const fixture = await postgresFixture();
  await fixture.pg.exec(`INSERT INTO users(id,status,"createdAt") VALUES ('operator','active',1),('target','active',1),('outsider','active',1);
    INSERT INTO account_logins VALUES ('operator','USER','operator',1),('target','USER','target',1),('outsider','USER','outsider',1);
    INSERT INTO permission_grants(user_id,permission,user_version,granted_by,granted_at) VALUES
      ('operator','users.read',1,'seed',1),('operator','users.suspend',1,'seed',1);`);
  return fixture;
}

test("Account administration uses current IdentityAccess authority before exact replay and preserves suspension history", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  const store = new PostgresUserManagement(db, authorization);
  const suspend = command("suspend", 1);
  await assert.rejects(store.execute("outsider", suspend, 10), { status: 403 });
  await assert.rejects(store.execute("operator", { ...suspend, target: "operator" }, 10), {
    status: 403,
  });
  const first = await store.execute("operator", suspend, 11);
  assert.deepEqual(first, {
    id: "target",
    requestId: suspend.requestId,
    status: "suspended",
    version: 2,
    at: 11,
  });
  assert.deepEqual(await store.execute("operator", suspend, 12), first);
  await assert.rejects(store.execute("operator", { ...suspend, reason: "changed" }, 12), {
    status: 409,
  });
  await assert.rejects(store.execute("operator", command("unsuspend", 1), 12), { status: 409 });
  const restored = await store.execute("operator", command("unsuspend", 2), 13);
  assert.equal(restored.status, "active");
  assert.equal(restored.version, 3);
  assert.deepEqual(await store.execute("operator", suspend, 14), first);
  assert.equal((await store.view("operator", { id: "target" })).detail?.operations.length, 2);
  assert.deepEqual(
    (await pg.query("SELECT status,status_version FROM users WHERE id='target'")).rows,
    [{ status: "active", status_version: 3 }],
  );
  assert.equal((await pg.query("SELECT * FROM user_events")).rows.length, 2);
  await pg.exec(
    "DELETE FROM permission_grants WHERE user_id='operator' AND permission='users.suspend'",
  );
  await assert.rejects(store.execute("operator", suspend, 15), { status: 403 });
  assert.equal((await pg.query("SELECT * FROM user_management_commands")).rows.length, 2);
});

test("a changed fingerprint remains a conflict before decoding a corrupted receipt", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  const store = new PostgresUserManagement(db, authorization);
  const original = command("suspend", 1);
  await store.execute("operator", original, 10);
  // Fixture-only corruption; production callers cannot update immutable command evidence.
  await pg.exec("UPDATE user_management_commands SET result='{}'::jsonb");
  await assert.rejects(store.execute("operator", { ...original, reason: "changed" }, 11), {
    status: 409,
    message: "操作編號已用於不同內容。",
  });
});

test("Account suspension respects the last current permission administrator", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  await pg.exec(
    "INSERT INTO permission_administrators(user_id,user_version,granted_by) VALUES ('target',1,'seed')",
  );
  await assert.rejects(
    new PostgresUserManagement(db, authorization).execute("operator", command("suspend", 1), 10),
    { status: 409 },
  );
  assert.deepEqual(
    (await pg.query("SELECT status,status_version FROM users WHERE id='target'")).rows,
    [{ status: "active", status_version: 1 }],
  );
  assert.deepEqual((await pg.query("SELECT * FROM user_management_commands")).rows, []);
});

for (const failure of ["event-unavailable", "authority-lost"] as const) {
  test(`Account administration rolls back state, receipt and event when ${failure}`, async (t) => {
    const { pg, db } = await fixture();
    t.after(() => pg.close());
    let injected = false;
    const failing: Database = {
      transaction: (work) =>
        db.transaction((sql) =>
          work(
            createSql(async (text, values) => {
              if (failure === "event-unavailable" && text.startsWith("INSERT INTO user_events")) {
                injected = true;
                throw new Error("event unavailable");
              }
              const result = await sql.query(text, values);
              if (failure === "authority-lost" && text.startsWith("UPDATE users SET status=$2")) {
                injected = true;
                await sql.query("UPDATE users SET status='paused' WHERE id='operator'");
              }
              return result;
            }),
          ),
        ),
    };
    await assert.rejects(
      new PostgresUserManagement(failing, authorization).execute(
        "operator",
        command("suspend", 1),
        10,
      ),
      failure === "event-unavailable" ? /event unavailable/ : { status: 403 },
    );
    assert.equal(injected, true);
    assert.deepEqual(
      (
        await pg.query(
          "SELECT status,status_version FROM users WHERE id IN ('operator','target') ORDER BY id",
        )
      ).rows,
      [
        { status: "active", status_version: 1 },
        { status: "active", status_version: 1 },
      ],
    );
    assert.deepEqual((await pg.query("SELECT * FROM user_management_commands")).rows, []);
    assert.deepEqual((await pg.query("SELECT * FROM user_events")).rows, []);
  });
}
