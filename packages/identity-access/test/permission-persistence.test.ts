import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresPermissionStore } from "../src/composition/bootstrap/permissions.js";
import type { PermissionCommand } from "../src/domain/permission.js";
import { protectPermissionAdministrator } from "../src/postgres.js";

function command(
  expectedVersion: number,
  permission: PermissionCommand["permission"] = "users.read",
  enabled = true,
): PermissionCommand {
  return {
    requestId: randomUUID(),
    target: "target",
    permission,
    enabled,
    expectedVersion,
    reason: "test",
  };
}

test("administrator protection counts only current User-bound assignments, including after restoration", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`INSERT INTO users(id,status,"createdAt") VALUES ('manager','active',1),('backup','active',1);
    INSERT INTO account_logins VALUES ('manager','USER','manager',1),('backup','USER','backup',1);
    INSERT INTO permission_administrators(user_id,user_version,granted_by) VALUES ('manager',1,'seed'),('backup',1,'seed');`);
  const protect = (id: string) =>
    db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      await protectPermissionAdministrator(sql, id);
    });
  await protect("manager");
  await protect("not-an-administrator");
  await pg.exec("UPDATE users SET status='paused' WHERE id='backup'");
  await assert.rejects(protect("manager"), { status: 409 });
  await pg.exec("UPDATE users SET status='active' WHERE id='backup'");
  await assert.rejects(protect("manager"), { status: 409 });
  await protect("backup"); // Its old assignment is not effective after User restoration.
  await pg.exec("UPDATE permission_administrators SET user_version=3 WHERE user_id='backup'");
  await protect("manager");
});

test("permission grants preserve version, dependencies, current qualification and exact replay", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`INSERT INTO users(id,status,"createdAt") VALUES ('admin','active',1),('backup','active',1),('target','active',1),('outsider','active',1);
    INSERT INTO account_logins VALUES ('admin','USER','permission-admin',1),('backup','USER','backup',1),('target','USER','target',1),('outsider','USER','outsider',1);
    INSERT INTO permission_administrators(user_id,user_version,granted_by) VALUES ('admin',1,'seed'),('backup',1,'seed');`);
  const store = new PostgresPermissionStore(db);
  await assert.rejects(store.change("outsider", command(0), 100), { status: 403 });
  await assert.rejects(store.change("admin", { ...command(0), target: "admin" }, 100), {
    status: 403,
  });
  await assert.rejects(store.change("admin", command(0, "users.suspend"), 100), { status: 409 });
  const read = command(0);
  const first = await store.change("admin", read, 101);
  assert.deepEqual(first, { requestId: read.requestId, version: 1 });
  assert.deepEqual(await store.change("admin", read, 999), first);
  await assert.rejects(store.change("admin", { ...read, reason: "changed" }, 102), { status: 409 });
  await assert.rejects(store.change("admin", command(0), 102), { status: 409 });
  assert.equal((await pg.query("SELECT * FROM permission_commands")).rows.length, 1);
  await store.change("admin", command(1, "users.suspend"), 103);
  await pg.exec("UPDATE users SET status='paused' WHERE id='target'");
  assert.deepEqual(
    (await pg.query("SELECT version FROM permission_subject_versions WHERE user_id='target'")).rows,
    [{ version: 3 }],
  );
  // A stale suspend grant still blocks removal of its prerequisite.
  await assert.rejects(store.change("admin", command(3, "users.read", false), 104), {
    status: 409,
    message: "請先撤銷使用者停權權限。",
  });
  await store.change("admin", command(3, "users.suspend", false), 105);
  await store.change("admin", command(4, "users.read", false), 106);
  await assert.rejects(store.change("admin", command(5), 107), { status: 409 });
  await pg.exec("UPDATE users SET status='active' WHERE id='target'");
  await store.change("admin", command(6), 108);
  assert.deepEqual(
    (await pg.query("SELECT user_version FROM permission_grants WHERE user_id='target'")).rows,
    [{ user_version: 3 }],
  );
  await pg.exec("UPDATE users SET status='paused' WHERE id='admin'");
  await assert.rejects(store.change("admin", read, 109), { status: 403 });
  await pg.exec("UPDATE users SET status='active' WHERE id='admin'");
  await assert.rejects(store.change("admin", read, 110), { status: 403 });
  await pg.exec("UPDATE permission_administrators SET user_version=3 WHERE user_id='admin'");
  assert.deepEqual(await store.change("admin", read, 111), first);
  assert.equal((await pg.query("SELECT * FROM permission_commands")).rows.length, 5);
});

test("permission reads compare the persisted enum and hide stale grants", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`INSERT INTO users(id,status,"createdAt") VALUES ('admin','active',1),('target','active',1);
    INSERT INTO account_logins VALUES ('admin','USER','permission-admin',1),('target','USER','target',1);
    INSERT INTO permission_administrators(user_id,user_version,granted_by) VALUES ('admin',1,'seed');`);
  const store = new PostgresPermissionStore(db);
  await store.change("admin", command(0), 100);
  const active = await store.read("admin", "target");
  assert.equal(active.history.length, 1);
  assert.deepEqual(active.target?.grants, [{ permission: "users.read", effective: true }]);
  await pg.exec("UPDATE users SET status='paused' WHERE id='target'");
  assert.deepEqual((await store.read("admin", "target")).target?.grants, [
    { permission: "users.read", effective: false },
  ]);
});

test("receipt failure rolls back the real grant and subject version writes", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`INSERT INTO users(id,status,"createdAt") VALUES ('admin','active',1),('target','active',1);
    INSERT INTO account_logins VALUES ('admin','USER','permission-admin',1),('target','USER','target',1);
    INSERT INTO permission_administrators(user_id,user_version,granted_by) VALUES ('admin',1,'seed');`);
  let reachedReceipt = false;
  const failing: Database = {
    transaction: (work) =>
      db.transaction((sql) =>
        work(
          createSql(async (text, values) => {
            if (text.startsWith("INSERT INTO permission_commands")) {
              reachedReceipt = true;
              throw new Error("receipt unavailable");
            }
            return sql.query(text, values);
          }),
        ),
      ),
  };
  await assert.rejects(
    new PostgresPermissionStore(failing).change("admin", command(0), 100),
    /receipt unavailable/,
  );
  assert.equal(reachedReceipt, true);
  for (const table of ["permission_grants", "permission_subject_versions", "permission_commands"]) {
    assert.deepEqual((await pg.query(`SELECT * FROM ${table}`)).rows, []);
  }
});
