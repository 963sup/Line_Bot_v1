import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createObjects } from "@line_bot_v1/resources/application/use-cases/objects";
import { createPostgresObjectDependencies } from "@line_bot_v1/resources/composition/bootstrap/objects";
import { createPostgresObjectReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/references";
import { PostgresIssueCollaborationStore } from "../src/adapters/postgres/collaboration.js";
import { IssueError } from "../src/domain.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
const options = { skip: !databaseUrl && !process.env.CI, timeout: 60_000 };

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

function holdCommit(db: Database) {
  const entered = deferred<number>();
  const release = deferred<void>();
  const held: Database = {
    transaction: (work) =>
      db.transaction(async (sql) => {
        try {
          const result = await work(sql);
          const pid = (await sql.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
          assert.equal(typeof pid, "number");
          entered.resolve(Number(pid));
          await release.promise;
          return result;
        } catch (error) {
          entered.reject(error);
          throw error;
        }
      }),
  };
  return { db: held, entered: entered.promise, release: () => release.resolve() };
}

test(
  "Issue Object pin serializes with Object archive and preserves the explicit revision",
  options,
  async (t) => {
    assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
    const fixture = await postgresSessions(databaseUrl);
    t.after(fixture.close);

    await fixture.db.transaction(async (sql) => {
      await sql.query('INSERT INTO users(id,status,"createdAt") VALUES($1,$2,$3)', [
        "actor",
        "active",
        1,
      ]);
      await sql.query("SELECT app_private.claim_account_login($1,'USER',$2,$3)", [
        "actor",
        "actor",
        1,
      ]);
    });
    await fixture.pool.query(
      "SELECT * FROM app_private.provision_organization_scope($1,$2,$3,$4,$5)",
      ["org", "actor", "org", "Org", 2],
    );
    await fixture.pool.query(
      "SELECT * FROM app_private.provision_repository('repo','actor','org','ORGANIZATION','Repo','private')",
    );

    const typeId = randomUUID();
    const objectId = randomUUID();
    let now = 10;
    const objectDependencies = createPostgresObjectDependencies(fixture.db);
    const objects = createObjects({ ...objectDependencies, now: () => now });
    await objects.executeType("actor", {
      action: "create",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 0,
      typeId,
      name: "Requirement",
      description: "",
    });
    const created = await objects.executeObject("actor", {
      action: "create",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId,
      typeId,
      name: "Requirement A",
      content: "v1",
    });
    assert.equal(created.kind, "object");
    const revisionId = created.result.id;

    await fixture.db.transaction(async (sql) => {
      await sql.query(
        "SELECT app_private.allocate_number('repository-work-item','REPOSITORY','repo','ISSUE','issue',1)",
      );
      await sql.query(
        `INSERT INTO issues(
         id,repository_id,number,publisher,title,body,criteria,state,state_reason,
         workflow_status,version,created_at,updated_at
       ) VALUES('issue','repo',1,'actor','Issue','','','OPEN',NULL,'pending',1,1,1)`,
      );
    });

    const held = holdCommit(fixture.db);
    const heldObjects = createObjects({
      ...createPostgresObjectDependencies(held.db),
      now: () => ++now,
    });
    const archiving = Promise.allSettled([
      heldObjects.executeObject("actor", {
        action: "archive",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: 1,
        objectId,
      }),
    ]);
    let pinning: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      const blockerPid = await held.entered;
      pinning = Promise.allSettled([
        new PostgresIssueCollaborationStore(
          createPostgresObjectReferenceReader,
          fixture.db,
        ).execute(
          { userId: "actor" },
          {
            action: "set-object-reference",
            requestId: randomUUID(),
            repositoryId: "repo",
            issueId: "issue",
            expectedVersion: 1,
            objectId,
            revisionId,
          },
          ++now,
        ),
      ]);
      const [waiter] = await fixture.waitForBlocked(blockerPid);
      assert.ok(waiter && waiter.pid !== blockerPid);
      held.release();
      assert.equal((await archiving)[0]?.status, "fulfilled");
      const [pin] = await pinning;
      assert.ok(pin?.status === "rejected" && pin.reason instanceof IssueError);
      assert.equal(pin.reason.status, 409);
      assert.match(pin.reason.message, /封存/);
    } finally {
      held.release();
      await archiving;
      await pinning;
    }

    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int count FROM app_private.issue_object_references",
        )
      ).rows[0]?.count,
      0,
    );
    assert.equal(
      (await fixture.pool.query("SELECT version FROM app_private.issues WHERE id='issue'")).rows[0]
        ?.version,
      1,
    );

    const unarchived = await objects.executeObject("actor", {
      action: "unarchive",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 2,
      objectId,
    });
    assert.equal(unarchived.result.version, 3);
    const issueStore = new PostgresIssueCollaborationStore(
      createPostgresObjectReferenceReader,
      fixture.db,
    );
    const command = {
      action: "set-object-reference" as const,
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "issue",
      expectedVersion: 1,
      objectId,
      revisionId,
    };
    const pinned = await issueStore.execute({ userId: "actor" }, command, ++now);
    assert.equal(pinned.version, 2);
    assert.deepEqual(await issueStore.execute({ userId: "actor" }, command, now), pinned);

    await objects.executeObject("actor", {
      action: "edit",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 3,
      objectId,
      name: "Requirement A",
      content: "v2",
    });
    const view = await issueStore.view({ userId: "actor" }, "repo", "issue");
    assert.equal(view.objectReferences[0]?.revisionId, revisionId);
    assert.equal(view.objectReferences[0]?.hasNewerRevision, true);
  },
);
