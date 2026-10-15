import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresPermissionStore } from "../src/composition/bootstrap/permissions.js";
import { type PermissionCommand, PermissionError } from "../src/domain/permission.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL permission changes serialize competing versions and concurrent exact replay", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await pool.query(`INSERT INTO app_private.users(id,status,"createdAt") VALUES ('manager','active',1),('target','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.permission_administrators(user_id,user_version,granted_by) VALUES ('manager',1,'seed');`);
  const store = new PostgresPermissionStore(db);
  const first: PermissionCommand = {
    requestId: randomUUID(),
    target: "target",
    permission: "users.read",
    enabled: true,
    expectedVersion: 0,
    reason: "test",
  };
  const second: PermissionCommand = {
    ...first,
    requestId: randomUUID(),
    permission: "partners.manage",
  };
  async function compete(commands: PermissionCommand[]) {
    const blocker = await pool.connect();
    let outcomes:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof store.change>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN; SELECT app_private.lock_governance('exclusive')");
      const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      assert.ok(pid);
      outcomes = Promise.allSettled(
        commands.map((command) => store.change("manager", command, 100)),
      );
      const waiters = await waitForBlocked(pid, commands.length);
      assert.equal(new Set(waiters.map((row) => row.pid)).size, commands.length);
      assert.ok(waiters.every((row) => row.wait_event === "advisory"));
      await blocker.query("COMMIT");
      return await outcomes;
    } finally {
      try {
        await blocker.query("ROLLBACK");
      } finally {
        blocker.release();
      }
      await outcomes;
    }
  }
  const results = await compete([first, second]);
  const accepted = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof PermissionError);
  assert.equal(rejected[0].reason.status, 409);
  const receipt = accepted[0]?.value;
  assert.ok(receipt);
  const winner = receipt.requestId === first.requestId ? first : second;
  assert.deepEqual(await compete([winner, winner]), [
    { status: "fulfilled", value: receipt },
    { status: "fulfilled", value: receipt },
  ]);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT version FROM app_private.permission_subject_versions WHERE user_id='target'",
      )
    ).rows,
    [{ version: 1 }],
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT permission FROM app_private.permission_grants WHERE user_id='target'",
      )
    ).rows,
    [{ permission: winner.permission }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.permission_commands")).rows[0]
      ?.count,
    1,
  );
});
