import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresRepositoryManagementStore } from "../src/composition/bootstrap/repository-management.js";
import { RepositoryError } from "../src/contracts/errors/repository-error.js";
import type { RepositoryManagementCommand } from "../src/contracts/input/repository-management.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL Repository lifecycle serializes competing versions and concurrent exact replay", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await pool.query(`INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1);
      SELECT app_private.claim_account_login('owner','USER','owner',1);
      INSERT INTO app_private.repositories(
        id,owner_account_id,owner_account_kind,name,visibility,version
      ) VALUES ('repo','owner','USER','Alpha','private',1);
      SELECT * FROM app_private.claim_scoped_namespace_name(
        'repository-name','OWNER_ACCOUNT','owner','REPOSITORY','repo','Alpha',1
      );`);
  const store = new PostgresRepositoryManagementStore(db);
  const first: RepositoryManagementCommand = {
    action: "rename",
    requestId: randomUUID(),
    repositoryId: "repo",
    expectedVersion: 1,
    name: "One",
  };
  const second: RepositoryManagementCommand = {
    ...first,
    requestId: randomUUID(),
    name: "Two",
  };

  async function compete(commands: readonly RepositoryManagementCommand[]) {
    const blocker = await pool.connect();
    let outcomes:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof store.execute>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN; SELECT app_private.lock_governance('exclusive')");
      const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      assert.ok(pid);
      outcomes = Promise.allSettled(
        commands.map((command) => store.execute("owner", command, 100)),
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

  const commands = [first, second] as const;
  const results = await compete(commands);
  const accepted = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof RepositoryError);
  assert.equal(rejected[0].reason.status, 409);
  const receipt = accepted[0]?.value;
  assert.ok(receipt);
  const winner = commands[results.findIndex((result) => result.status === "fulfilled")];
  assert.ok(winner);

  assert.deepEqual(await compete([winner, winner]), [
    { status: "fulfilled", value: receipt },
    { status: "fulfilled", value: receipt },
  ]);
  assert.deepEqual(
    (await pool.query("SELECT name,version FROM app_private.repositories WHERE id='repo'")).rows,
    [{ name: winner.name, version: 2 }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.repository_commands")).rows[0]
      ?.count,
    1,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.repository_events")).rows[0]
      ?.count,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM app_private.namespace_binding_history WHERE family='repository-name' AND action='RENAME'",
      )
    ).rows[0]?.count,
    1,
  );
});
