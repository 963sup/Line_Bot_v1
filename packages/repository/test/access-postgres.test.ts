import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import type { RepositoryAccessCommand } from "../src/contracts/repositories/access.js";
import { RepositoryError } from "../src/domain.js";
import { PostgresRepositoryAccessStore } from "../src/postgres/access-management.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL Repository access serializes competing versions, exact replay and failed commands", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(`INSERT INTO users(id,status,status_version,"createdAt")
      VALUES('owner','active',1,1),('member','active',1,1)`);
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','private')",
  );
  const store = new PostgresRepositoryAccessStore(db);
  const first: RepositoryAccessCommand = {
    action: "grant",
    requestId: randomUUID(),
    repositoryId: "repo",
    subjectKind: "USER",
    subjectId: "member",
    capability: "read",
    expectedVersion: 0,
  };
  const second: RepositoryAccessCommand = {
    ...first,
    requestId: randomUUID(),
    capability: "write",
  };

  // A known backend holds the existing protocol until both actual writers wait.
  async function compete(commands: RepositoryAccessCommand[]) {
    const blocker = await pool.connect();
    const operations: Array<ReturnType<typeof store.execute>> = [];
    let outcomes:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof store.execute>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN;SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      assert.ok(pid);
      for (const command of commands) operations.push(store.execute("owner", command, 10));
      outcomes = Promise.allSettled(operations);
      const waiting = await waitForBlocked(pid, commands.length);
      assert.equal(new Set(waiting.map((row) => row.pid)).size, commands.length);
      assert.ok(waiting.every((row) => row.pid !== pid && row.wait_event === "advisory"));
      await blocker.query("COMMIT");
      return await outcomes;
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await outcomes;
    }
  }
  const results = await compete([first, second]);
  const accepted = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof RepositoryError);
  assert.equal(rejected[0].reason.status, 409);
  const receipt = accepted[0]?.value;
  assert.ok(receipt);
  assert.equal(receipt.version, 1);
  const winner = receipt.requestId === first.requestId ? first : second;
  const replay = await compete([winner, winner]);
  assert.deepEqual(replay, [
    { status: "fulfilled", value: receipt },
    { status: "fulfilled", value: receipt },
  ]);
  const mismatched = await compete([winner, { ...winner, capability: "admin" }]);
  assert.deepEqual(mismatched[0], { status: "fulfilled", value: receipt });
  const mismatch = mismatched[1];
  assert.ok(mismatch?.status === "rejected" && mismatch.reason instanceof RepositoryError);
  assert.equal(mismatch.reason.status, 409);
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "revoke",
        requestId: randomUUID(),
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "owner",
        expectedVersion: 1,
      },
      12,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT capability,version FROM app_private.repository_access WHERE principal_id='member'",
      )
    ).rows,
    [{ capability: winner.capability, version: 1 }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.repository_commands")).rows[0]
      ?.count,
    1,
  );
});
