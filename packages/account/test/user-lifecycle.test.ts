import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresUserStore } from "../src/composition/bootstrap/user.js";

const subject = `U${"1".repeat(32)}`;
test("explicit Google binding preserves ownership, uniqueness rollback, pause restoration and suspension", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const users = new PostgresUserStore(db, { async protectPermissionAdministrator() {} });
  await assert.rejects(users.registerLine("invalid", subject, "alice", 1), { status: 400 });
  await assert.rejects(
    users.bind(
      "line:test",
      "invalid",
      { id: randomUUID(), sub: "invalid", email: "invalid@example.test" },
      1,
    ),
    { status: 400 },
  );
  const first = await users.registerLine("line:test", subject, "alice", 1);
  const otherSubject = `U${"2".repeat(32)}`;
  const second = await users.registerLine("line:test", otherSubject, "bob", 1);
  const google = { id: randomUUID(), sub: "alice-google", email: "alice@example.test" };
  const otherGoogle = { id: randomUUID(), sub: "bob-google", email: "bob@example.test" };
  await pg.query("INSERT INTO auth.users(id,is_anonymous) VALUES($1,false),($2,false)", [
    google.id,
    otherGoogle.id,
  ]);
  await assert.rejects(users.bind("line:test", `U${"3".repeat(32)}`, google, 2), { status: 403 });
  const linked = await users.bind("line:test", subject, google, 3);
  assert.deepEqual(await users.bind("line:test", subject, google, 4), linked);
  await assert.rejects(users.bind("line:test", subject, otherGoogle, 5), {
    status: 409,
    message: "此 LINE 已綁定其他 Google 帳號，請使用原帳號登入。",
  });
  await assert.rejects(users.bind("line:test", otherSubject, google, 5), {
    status: 409,
    message: "此 Google 帳號已綁定其他 LINE 會員。",
  });
  await assert.rejects(
    users.bind("line:test", otherSubject, { ...otherGoogle, id: google.id }, 5),
    { status: 409, message: "帳號已被綁定，請重新載入。" },
  );
  assert.equal(await users.googleIdentity(second.id), null);
  await assert.rejects(users.pause(first.id, otherGoogle.id), { status: 403 });
  await users.pause(second.id);
  assert.equal((await users.bind("line:test", otherSubject, otherGoogle, 6)).status, "active");
  await users.suspend(first.id);
  await assert.rejects(users.bind("line:test", subject, google, 7), { status: 403 });
  assert.equal(
    (
      await pg.query("SELECT * FROM user_events WHERE user_id=$1 AND type='supabase_linked'", [
        first.id,
      ])
    ).rows.length,
    1,
  );
});
test("User registration, pause, restore and locator changes preserve identity and event history", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  // This fixture has no permission administrators; administration protection permits it.
  const users = new PostgresUserStore(db, { async protectPermissionAdministrator() {} });
  const first = await users.registerLine("line:test", subject, "alice", 1);
  assert.deepEqual(await users.registerLine("line:test", subject, "alice", 2), first);
  await assert.rejects(users.restoreLine("line:test", `U${"2".repeat(32)}`, 3), { status: 404 });
  await users.pause(first.id);
  await assert.rejects(users.registerLine("line:test", subject, "alice", 4), {
    status: 409,
    message: "會員已存在，請使用恢復功能。",
  });
  await assert.rejects(users.registerLine("line:test", subject, "other", 4), {
    status: 409,
    message: "此 User 已使用其他登入名稱。",
  });
  await assert.rejects(users.updateLogin(first.id, "renamed", "alice", 4), { status: 403 });
  const restored = await users.restoreLine("line:test", subject, 5);
  assert.equal(restored.id, first.id);
  assert.equal(restored.status, "active");
  assert.deepEqual(await users.restoreLine("line:test", subject, 6), restored);
  const renamed = await users.updateLogin(first.id, "renamed", "alice", 7);
  assert.equal(renamed.login, "renamed");
  assert.equal(renamed.id, first.id);
  await users.suspend(first.id);
  for (const operation of [
    () => users.restoreLine("line:test", subject, 8),
    () => users.registerLine("line:test", subject, "renamed", 8),
  ]) {
    await assert.rejects(operation, { status: 403 });
  }
  assert.deepEqual(
    (await pg.query<{ type: string }>("SELECT type FROM user_events ORDER BY at,id")).rows
      .map((row) => row.type)
      .sort(),
    ["membership_deactivated", "membership_resumed", "registered", "suspended"].sort(),
  );
  assert.equal((await pg.query("SELECT * FROM users")).rows.length, 1);
  assert.equal((await users.get(first.id)).auth_user_id, null);
});
