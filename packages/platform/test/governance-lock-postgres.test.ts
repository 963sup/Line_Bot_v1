import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import { postgresSessions } from "../src/testing/postgres-sessions.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL governance contract preserves the original key, shared compatibility, waiting and transaction release", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  const clients: PoolClient[] = [];
  let acquired: Promise<unknown> | undefined;
  const locks = () =>
    pool.query<{ pid: number; mode: string; granted: boolean }>(
      `SELECT pid,mode,granted FROM pg_locks WHERE locktype='advisory'
     AND classid=(71020260912::bigint >> 32)::oid
     AND objid=(71020260912::bigint & 4294967295)::oid AND objsubid=1
     AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY pid`,
    );
  try {
    for (let index = 0; index < 3; index++) clients.push(await pool.connect());
    const [first, second, exclusive] = clients;
    assert.ok(first && second && exclusive);
    const pids: number[] = [];
    for (const client of clients) {
      await client.query("BEGIN;SET LOCAL ROLE line_app;SET LOCAL statement_timeout='5s'");
      const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      assert.ok(pid);
      pids.push(pid);
    }
    const [firstPid, secondPid, exclusivePid] = pids;
    assert.ok(firstPid && secondPid && exclusivePid);
    assert.equal(new Set(pids).size, 3);
    await first.query("SELECT app_private.lock_governance('shared')");
    await second.query("SELECT app_private.lock_governance('shared')");
    assert.deepEqual(
      (await locks()).rows,
      [...pids.slice(0, 2)]
        .sort((a, b) => a - b)
        .map((pid) => ({ pid, mode: "ShareLock", granted: true })),
    );
    const pending = exclusive.query("SELECT app_private.lock_governance('exclusive')");
    acquired = Promise.allSettled([pending]);
    assert.equal((await waitForBlocked(firstPid))[0]?.pid, exclusivePid);
    await first.query("COMMIT");
    assert.equal((await waitForBlocked(secondPid))[0]?.pid, exclusivePid);
    await second.query("COMMIT");
    await pending;
    assert.deepEqual((await locks()).rows, [
      { pid: exclusivePid, mode: "ExclusiveLock", granted: true },
    ]);
    await exclusive.query("ROLLBACK");
    assert.deepEqual((await locks()).rows, []);
    await exclusive.query(
      "BEGIN;SET LOCAL ROLE line_app;SELECT app_private.lock_governance('exclusive');COMMIT",
    );
    assert.deepEqual((await locks()).rows, []);
    for (const mode of [null, "", "read"]) {
      await assert.rejects(
        db.transaction((sql) => sql.query("SELECT app_private.lock_governance($1)", [mode])),
        (error) => error instanceof Error && "code" in error && error.code === "22023",
      );
    }
    const permissions = await pool.query(`SELECT p.prosecdef,
      has_function_privilege('line_app',p.oid,'execute') AS runtime,
      has_function_privilege('anon',p.oid,'execute') AS anonymous,
      has_function_privilege('authenticated',p.oid,'execute') AS authenticated
      FROM pg_proc p WHERE p.oid='app_private.lock_governance(text)'::regprocedure`);
    assert.deepEqual(permissions.rows, [
      { prosecdef: false, runtime: true, anonymous: false, authenticated: false },
    ]);
  } finally {
    // Release holders before awaiting the waiter, then return every borrowed connection.
    const released = await Promise.allSettled(clients.map((client) => client.query("ROLLBACK")));
    for (const [index, client] of clients.entries())
      client.release(released[index]?.status === "rejected");
    await acquired;
  }
});
