import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createSql, type SqlRow } from "@line_bot_v1/platform/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { allocateNumber } from "../src/postgres.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;

async function allocateDiscussion(
  sql: Parameters<typeof allocateNumber>[0],
  repositoryId: string,
  discussionId: string,
  at: number,
) {
  const number = await allocateNumber(sql, {
    family: "repository-discussion",
    scopeKind: "REPOSITORY",
    scopeId: repositoryId,
    resourceKind: "DISCUSSION",
    resourceId: discussionId,
    at,
  });
  await sql.query(
    `INSERT INTO discussions(
       id,repository_id,number,author,title,body,category,state,version,created_at,updated_at
     ) VALUES($1,$2,$3,'numbering-owner','Test','Body','General','OPEN',1,$4,$4)
     ON CONFLICT (id) DO NOTHING`,
    [discussionId, repositoryId, number, at],
  );
  return number;
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  const timeout = new AbortController();
  try {
    return await Promise.race([
      promise,
      delay(5_000, undefined, { signal: timeout.signal }).then(() => {
        throw new Error(`${label} did not complete before the independent Series was released.`);
      }),
    ]);
  } finally {
    timeout.abort();
  }
}

test("PostgreSQL serializes one Series without imposing a global allocator lock", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { db, pool, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await pool.query(`
      INSERT INTO app_private.users(id,status,"createdAt")
      VALUES ('numbering-owner','active',0);
      SELECT app_private.claim_account_login('numbering-owner','USER','numbering-owner',0);
      INSERT INTO app_private.repositories(
        id,owner_account_id,owner_account_kind,name,visibility,is_archived,version
      ) VALUES
        ('repo-shared','numbering-owner','USER','Shared','private',false,1),
        ('repo-one','numbering-owner','USER','One','private',false,1),
        ('repo-two','numbering-owner','USER','Two','private',false,1);
      SELECT app_private.claim_scoped_namespace_name(
        'repository-name','OWNER_ACCOUNT','numbering-owner','REPOSITORY',id,name,1
      ) FROM app_private.repositories
      WHERE id IN ('repo-shared','repo-one','repo-two');
    `);

  const clientA = await pool.connect();
  const sqlA = createSql(async (text, values) => {
    const result = await clientA.query<SqlRow>(text, values);
    return { rows: result.rows, rowCount: result.rowCount };
  });
  let pending: Promise<unknown> | undefined;
  try {
    await clientA.query(
      "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
    );
    const blockerPid = (await clientA.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
      .rows[0]?.pid;
    assert.ok(blockerPid);
    assert.equal(await allocateDiscussion(sqlA, "repo-shared", "discussion-a", 1), 1);

    pending = db.transaction((sql) => allocateDiscussion(sql, "repo-shared", "discussion-b", 2));
    const [waiter] = await waitForBlocked(blockerPid);
    assert.ok(waiter);
    assert.ok(waiter.wait_event.length > 0);
    await clientA.query("COMMIT");
    assert.equal(await pending, 2);
    pending = undefined;

    await clientA.query(
      "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
    );
    assert.equal(await allocateDiscussion(sqlA, "repo-shared", "discussion-c", 3), 3);
    pending = db.transaction((sql) => allocateDiscussion(sql, "repo-shared", "discussion-c", 4));
    const [retryWaiter] = await waitForBlocked(blockerPid);
    assert.ok(retryWaiter);
    await clientA.query("COMMIT");
    assert.equal(await pending, 3);
    pending = undefined;

    await clientA.query(
      "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
    );
    assert.equal(await allocateDiscussion(sqlA, "repo-one", "discussion-one", 5), 1);
    const independent = db.transaction((sql) =>
      allocateDiscussion(sql, "repo-two", "discussion-two", 6),
    );
    pending = independent;
    assert.equal(await bounded(independent, "Independent Series allocation"), 1);
    pending = undefined;
    await clientA.query("COMMIT");
  } finally {
    await clientA.query("ROLLBACK").catch(() => {});
    clientA.release();
    if (pending) await Promise.allSettled([pending]);
  }

  await assert.rejects(
    db.transaction(async (sql) => {
      await allocateDiscussion(sql, "repo-shared", "discussion-rolled-back", 7);
      throw new Error("force native rollback");
    }),
    /force native rollback/,
  );
  assert.equal(
    await db.transaction((sql) => allocateDiscussion(sql, "repo-shared", "discussion-deleted", 8)),
    4,
  );
  await db.transaction(async (sql) => {
    await sql.query(
      `UPDATE discussions
         SET title='[deleted]',body='',deleted_at=9,version=version+1,updated_at=9
         WHERE id='discussion-deleted'`,
    );
  });
  assert.equal(
    await db.transaction((sql) =>
      allocateDiscussion(sql, "repo-shared", "discussion-after-delete", 10),
    ),
    5,
  );
  assert.equal(
    (
      await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM app_private.number_allocations
           WHERE family='repository-discussion' AND scope_id='repo-shared'`,
      )
    ).rows[0]?.count,
    5,
  );
});
