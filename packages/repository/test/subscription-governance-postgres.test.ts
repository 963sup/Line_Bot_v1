import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresRepositoryManagementStore } from "../src/composition/bootstrap/repository-management.js";
import { PostgresRepositorySubscriptionStore } from "../src/composition/bootstrap/repository-subscription.js";
import { RepositoryError } from "../src/contracts/repository.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL Watch holds shared governance through access validation and releases it on rollback", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await pool.query(`
      INSERT INTO app_private.users(id,status,status_version,"createdAt")
      VALUES ('owner','active',1,1),('viewer','active',1,1);
      SELECT app_private.claim_account_login(id,'USER',id,1)
      FROM app_private.users WHERE id IN ('owner','viewer');
      INSERT INTO app_private.repositories(
        id,owner_account_id,owner_account_kind,name,visibility,is_archived,version
      ) VALUES
        ('repo','owner','USER','Repo','public',false,1),
        ('repo-noop','owner','USER','Noop','public',false,1);
      INSERT INTO app_private.repository_subscriptions(
        repository_id,user_id,state,version,updated_at
      ) VALUES
        ('repo','viewer','SUBSCRIBED',1,1),
        ('repo-noop','viewer','SUBSCRIBED',1,1);
    `);

  const subscription = new PostgresRepositorySubscriptionStore(db);
  const management = new PostgresRepositoryManagementStore(db);
  const watchRequestId = randomUUID();
  const blocker = await pool.connect();
  let watch: ReturnType<typeof subscription.execute> | undefined;
  let visibility: ReturnType<typeof management.execute> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `repository-command:viewer:${watchRequestId}`,
    ]);
    const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
      .rows[0]?.pid;
    assert.ok(blockerPid);

    watch = subscription.execute(
      "viewer",
      {
        action: "set",
        requestId: watchRequestId,
        repositoryId: "repo",
        expectedVersion: 1,
        state: "IGNORED",
      },
      10,
    );
    const watchWaiter = (await waitForBlocked(blockerPid))[0];
    assert.ok(watchWaiter);
    assert.equal(watchWaiter.wait_event, "advisory");

    visibility = management.execute(
      "owner",
      {
        action: "visibility",
        requestId: randomUUID(),
        repositoryId: "repo",
        expectedVersion: 1,
        visibility: "private",
      },
      11,
    );
    const lifecycleWaiter = (await waitForBlocked(watchWaiter.pid))[0];
    assert.ok(lifecycleWaiter);
    assert.notEqual(lifecycleWaiter.pid, blockerPid);
    assert.equal(lifecycleWaiter.wait_event, "advisory");

    await blocker.query("COMMIT");
    assert.deepEqual(await watch, {
      requestId: watchRequestId,
      repositoryId: "repo",
      state: "IGNORED",
      version: 2,
      at: 10,
    });
    await visibility;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled([watch, visibility].filter((value) => value !== undefined));
  }

  assert.deepEqual(
    (
      await pool.query(
        `SELECT state,version FROM app_private.repository_subscriptions
           WHERE repository_id='repo' AND user_id='viewer'`,
      )
    ).rows,
    [{ state: "IGNORED", version: 2 }],
  );
  assert.equal(
    (
      await pool.query(
        `SELECT count(*)::int AS count FROM app_private.repository_commands
           WHERE actor='viewer' AND request_id=$1`,
        [watchRequestId],
      )
    ).rows[0]?.count,
    1,
  );
  assert.equal(
    (await pool.query("SELECT visibility FROM app_private.repositories WHERE id='repo'")).rows[0]
      ?.visibility,
    "private",
  );
  await assert.rejects(
    subscription.view("viewer", { repositoryId: "repo" }),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
  await assert.rejects(
    subscription.execute(
      "viewer",
      {
        action: "set",
        requestId: randomUUID(),
        repositoryId: "repo",
        expectedVersion: 2,
        state: "SUBSCRIBED",
      },
      12,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  await assert.rejects(
    subscription.execute(
      "viewer",
      {
        action: "set",
        requestId: randomUUID(),
        repositoryId: "repo-noop",
        expectedVersion: 1,
        state: "SUBSCRIBED",
      },
      20,
    ),
    (error) =>
      error instanceof RepositoryError &&
      error.status === 409 &&
      error.message === "Repository subscription 沒有變更。",
  );
  await management.execute(
    "owner",
    {
      action: "visibility",
      requestId: randomUUID(),
      repositoryId: "repo-noop",
      expectedVersion: 1,
      visibility: "private",
    },
    21,
  );
  assert.equal(
    (await pool.query("SELECT visibility FROM app_private.repositories WHERE id='repo-noop'"))
      .rows[0]?.visibility,
    "private",
  );
});
