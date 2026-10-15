import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresUserStore } from "../src/composition/bootstrap/user.js";
import { UserError } from "../src/domain/user.js";
import { PostgresFollowStore } from "../src/postgres/follows.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
const options = { skip: !databaseUrl && !process.env.CI, timeout: 60_000 };
const noAdministrators = { async protectPermissionAdministrator() {} };

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  if (!resolve || !reject) throw new Error("Promise executor did not initialize synchronously");
  return { promise, resolve, reject };
}
function hold(db: Database, rollback = false) {
  const entered = deferred<number>();
  const release = deferred<void>();
  const abort = new Error("controlled rollback");
  const held: Database = {
    transaction: (work) =>
      db.transaction(async (sql) => {
        try {
          const pid = (await sql.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
          assert.equal(typeof pid, "number");
          const result = await work(sql);
          entered.resolve(Number(pid));
          await release.promise;
          if (rollback) throw abort;
          return result;
        } catch (error) {
          entered.reject(error);
          throw error;
        }
      }),
  };
  return { db: held, entered: entered.promise, release: () => release.resolve(), abort };
}
async function fixture() {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const fixture = await postgresSessions(databaseUrl);
  try {
    await fixture.db.transaction(async (sql) => {
      await sql.query(
        `INSERT INTO users(id,status,"createdAt") VALUES ('actor','active',1),('target','active',1)`,
      );
      await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
    });
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}

for (const rollback of [false, true]) {
  test(
    `PostgreSQL Follow observes actor pause ${rollback ? "rollback" : "commit"} after shared waiting`,
    options,
    async (t) => {
      const f = await fixture();
      t.after(f.close);
      const held = hold(f.db, rollback);
      const pausing = new PostgresUserStore(held.db, noAdministrators).pause("actor");
      const pauseResult = Promise.allSettled([pausing]);
      let following: Promise<PromiseSettledResult<void>[]> | undefined;
      try {
        const pid = await held.entered;
        following = Promise.allSettled([
          new PostgresFollowStore(f.db).follow("actor", "target", 10),
        ]);
        const [waiter] = await f.waitForBlocked(pid);
        assert.ok(waiter && waiter.pid !== pid && waiter.wait_event === "advisory");
        held.release();
        const [pause] = await pauseResult;
        const [follow] = await following;
        if (rollback) {
          assert.ok(pause?.status === "rejected" && pause.reason === held.abort);
          assert.equal(follow?.status, "fulfilled");
        } else {
          assert.equal(pause?.status, "fulfilled");
          assert.ok(follow?.status === "rejected" && follow.reason instanceof UserError);
          assert.equal(follow.reason.status, 403);
        }
        assert.equal(
          (await f.pool.query("SELECT count(*)::int AS count FROM app_private.user_follows"))
            .rows[0]?.count,
          rollback ? 1 : 0,
        );
        assert.deepEqual(
          (
            await f.pool.query(
              "SELECT status,status_version FROM app_private.users WHERE id='actor'",
            )
          ).rows,
          [{ status: rollback ? "active" : "paused", status_version: rollback ? 1 : 2 }],
        );
      } finally {
        held.release();
        await pauseResult;
        await following;
      }
    },
  );
}

test(
  "PostgreSQL Follow holds qualified facts until commit before target pause can proceed",
  options,
  async (t) => {
    const f = await fixture();
    t.after(f.close);
    const held = hold(f.db);
    const writing = Promise.allSettled([
      new PostgresFollowStore(held.db).follow("actor", "target", 10),
    ]);
    let pausing:
      | Promise<PromiseSettledResult<Awaited<ReturnType<PostgresUserStore["pause"]>>>[]>
      | undefined;
    try {
      const pid = await held.entered;
      pausing = Promise.allSettled([new PostgresUserStore(f.db, noAdministrators).pause("target")]);
      const [waiter] = await f.waitForBlocked(pid);
      assert.ok(waiter && waiter.pid !== pid && waiter.wait_event === "advisory");
      held.release();
      assert.equal((await writing)[0]?.status, "fulfilled");
      assert.equal((await pausing)[0]?.status, "fulfilled");
      assert.equal(
        (await f.pool.query("SELECT count(*)::int AS count FROM app_private.user_follows")).rows[0]
          ?.count,
        1,
      );
      assert.equal(
        (await f.pool.query("SELECT status FROM app_private.users WHERE id='target'")).rows[0]
          ?.status,
        "paused",
      );
    } finally {
      held.release();
      await writing;
      await pausing;
    }
  },
);
