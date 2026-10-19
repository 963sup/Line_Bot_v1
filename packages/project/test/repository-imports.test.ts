import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PostgresIssueStore } from "@line_bot_v1/issue/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresProjectManagementStore } from "../src/adapters/outbound/persistence/postgres-project-management-store.js";
import { PostgresProjectRepositoryImports } from "../src/adapters/outbound/persistence/postgres-project-repository-imports.js";
import {
  parseProjectManagementCommand,
  parseProjectManagementView,
} from "../src/application/management.js";
import { ProjectError } from "../src/domain.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL import workers serialize admission, skip busy Projects and stop after source access revocation", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 120_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply disposable PostgreSQL");
  const { pool, db, close } = await postgresSessions(databaseUrl);
  t.after(close);
  await db.transaction(async (sql) => {
    for (const id of ["owner", "source"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','source','source','USER','Repo','private')",
  );
  await pool.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','owner','read',1)",
  );
  const projects = new PostgresProjectManagementStore(db);
  const issues = new PostgresIssueStore(db);
  const worker = new PostgresProjectRepositoryImports(db);
  const source = { userId: "source" };
  const add = () =>
    issues.execute(
      source,
      {
        action: "create",
        requestId: randomUUID(),
        repositoryId: "repo",
        title: "Future source",
        body: "",
        criteria: "",
        assigneeIds: [],
      },
      5,
    );
  const created = await projects.execute(
    { userId: "owner" },
    {
      action: "create-project",
      requestId: randomUUID(),
      ownerAccountId: "owner",
      ownerKind: "USER",
      expectedVersion: 0,
      title: "Imported",
      public: false,
      repositoryId: "repo",
      teamId: null,
      importIssues: "OPEN",
    },
    10,
  );
  await add();
  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `project:${created.projectId}`,
    ]);
    assert.equal(
      (await worker.once(20, 20)).importedItems,
      0,
      "busy Project must be deferred without blocking Issue creation",
    );
  } finally {
    await holder.query("ROLLBACK");
    holder.release();
  }
  const results = await Promise.all([worker.once(20, 21), worker.once(20, 21)]);
  assert.equal(
    results.reduce((sum, result) => sum + result.importedItems, 0),
    1,
  );
  assert.equal((await projects.view({ userId: "owner" }, created.projectId)).items.length, 1);
  await add();
  await pool.query(`CREATE FUNCTION app_private.reject_import_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action='import-repository-items' THEN RAISE EXCEPTION 'test import event failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_import_test BEFORE INSERT ON app_private.project_events FOR EACH ROW EXECUTE FUNCTION app_private.reject_import_test()`);
  await assert.rejects(worker.once(20, 25), /test import event failure/);
  assert.equal(
    (await projects.view({ userId: "owner" }, created.projectId)).items.length,
    1,
    "failed event rolls back the entire admission batch",
  );
  await pool.query(
    "DROP TRIGGER reject_import_test ON app_private.project_events;DROP FUNCTION app_private.reject_import_test()",
  );
  assert.equal((await worker.once(20, 26)).importedItems, 1);
  await add();
  await pool.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='owner'",
  );
  assert.equal((await worker.once(20, 30)).paused, 1);
  const view = await projects.view({ userId: "owner" }, created.projectId);
  assert.equal(
    view.items.length,
    0,
    "current viewer access also hides previously imported private Issues",
  );
  assert.equal(view.repositoryImports?.length, 0, "source metadata must not leak after revocation");
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM app_private.project_items WHERE project_id=$1",
        [created.projectId],
      )
    ).rows[0]?.count,
    2,
  );
});

test("Repository import admits existing/future matching Issues with replay, current authority, exclusion and lifecycle", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    for (const id of ["owner", "reader"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await pg.transaction(async (tx) => {
    await tx.query(
      "SELECT app_private.claim_scoped_namespace_name('repository-name','OWNER_ACCOUNT','owner','REPOSITORY','repo','Repo',1)",
    );
    await tx.query(
      "INSERT INTO repositories(id,owner_account_id,owner_account_kind,name,visibility,version) VALUES('repo','owner','USER','Repo','private',1)",
    );
  });
  const issues = new PostgresIssueStore(db);
  const projects = new PostgresProjectManagementStore(db);
  const worker = new PostgresProjectRepositoryImports(db);
  const owner = { userId: "owner" };
  const addIssue = (title: string) =>
    issues.execute(
      owner,
      {
        action: "create",
        requestId: randomUUID(),
        repositoryId: "repo",
        title,
        body: "",
        criteria: "",
        assigneeIds: [],
      },
      5,
    );
  const first = await addIssue("Open source");
  const closed = await addIssue("Closed source");
  await issues.execute(
    owner,
    {
      action: "close",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: closed.id,
      expectedVersion: closed.version,
      stateReason: "COMPLETED",
      note: "",
    },
    6,
  );
  const command = {
    action: "create-project" as const,
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER" as const,
    expectedVersion: 0 as const,
    title: "Imported plan",
    public: false,
    repositoryId: "repo",
    teamId: null,
    importIssues: "OPEN" as const,
  };
  assert.deepEqual(parseProjectManagementCommand(command), command);
  assert.throws(
    () => parseProjectManagementCommand({ ...command, repositoryId: null }),
    (error) => error instanceof ProjectError && error.status === 400,
  );
  const created = await projects.execute(owner, command, 10);
  assert.equal(created.data.importedItems, 1);
  await assert.rejects(
    projects.execute(owner, { ...command, requestId: randomUUID(), repositoryId: null }, 10),
    (error) => error instanceof ProjectError && error.status === 400,
  );
  assert.deepEqual(await projects.execute(owner, command, 11), created);
  let view = await projects.view(owner, created.projectId);
  assert.deepEqual(parseProjectManagementView(view), view);
  assert.deepEqual(
    view.items.map((item) => item.issue?.id),
    [first.id],
  );
  assert.equal(view.repositoryImports?.[0]?.enabled, true);
  assert.equal(view.repositoryImports?.[0]?.ownerLogin, "owner");
  const future = await addIssue("Future source");
  assert.equal((await worker.once(20, 20)).importedItems, 1);
  assert.equal((await worker.once(20, 21)).importedItems, 0);
  view = await projects.view(owner, created.projectId);
  assert.equal(view.project.version, 2);
  assert.equal(view.items.length, 2);
  const removed = view.items.find((item) => item.issue?.id === first.id);
  assert.ok(removed);
  await projects.execute(
    owner,
    {
      action: "delete-item",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: view.project.version,
      itemId: removed.id,
      itemVersion: removed.version,
    },
    30,
  );
  assert.equal((await worker.once(20, 31)).importedItems, 0);
  assert.equal((await projects.view(owner, created.projectId)).items.length, 1);
  assert.equal((await pg.query("SELECT id FROM issues WHERE id=$1", [first.id])).rows.length, 1);
  view = await projects.view(owner, created.projectId);
  await projects.execute(
    owner,
    {
      action: "set-repository-import",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: view.project.version,
      repositoryId: "repo",
      importIssues: "ALL",
    },
    40,
  );
  view = await projects.view(owner, created.projectId);
  assert.deepEqual(
    new Set(view.items.map((item) => item.issue?.id)),
    new Set([closed.id, future.id]),
  );
  const archived = view.items.find((item) => item.issue?.id === future.id);
  assert.ok(archived);
  await projects.execute(
    owner,
    {
      action: "archive-item",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: view.project.version,
      itemId: archived.id,
      itemVersion: archived.version,
    },
    41,
  );
  assert.equal((await worker.once(20, 42)).importedItems, 0);
  view = await projects.view(owner, created.projectId);
  await projects.execute(
    owner,
    {
      action: "set-repository-import",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: view.project.version,
      repositoryId: "repo",
      importIssues: null,
    },
    50,
  );
  await addIssue("While disabled");
  assert.equal((await worker.once(20, 51)).importedItems, 0);
  view = await projects.view(owner, created.projectId);
  await projects.execute(
    owner,
    {
      action: "set-repository-import",
      requestId: randomUUID(),
      projectId: created.projectId,
      expectedVersion: view.project.version,
      repositoryId: "repo",
      importIssues: "OPEN",
    },
    60,
  );
  await pg.query("UPDATE users SET status='suspended',status_version=2 WHERE id='owner'");
  const paused = await worker.once(20, 61);
  assert.equal(paused.paused, 1);
  await pg.query("UPDATE users SET status='active',status_version=3 WHERE id='owner'");
  assert.equal((await worker.once(20, 62)).checked, 0);
  view = await projects.view(owner, created.projectId);
  assert.equal(view.repositoryImports?.[0]?.enabled, false);
  await assert.rejects(
    projects.execute(
      { userId: "reader" },
      { ...command, requestId: randomUUID(), ownerAccountId: "reader" },
      70,
    ),
    (error) =>
      error instanceof Error && "status" in error && (error.status === 403 || error.status === 404),
  );
  const roots = (await pg.query("SELECT id FROM projects WHERE owner_account_id='reader'")).rows;
  assert.equal(
    roots.length,
    0,
    "failed source access rolls the new Project and number allocation back",
  );
});

test("Large repository import continues after the initial bounded batch without duplicate or truncated membership", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','private')",
  );
  const issues = new PostgresIssueStore(db);
  for (let i = 0; i < 101; i++)
    await issues.execute(
      { userId: "owner" },
      {
        action: "create",
        requestId: randomUUID(),
        repositoryId: "repo",
        title: `Source ${i}`,
        body: "",
        criteria: "",
        assigneeIds: [],
      },
      5,
    );
  const projects = new PostgresProjectManagementStore(db);
  const worker = new PostgresProjectRepositoryImports(db);
  const command = {
    action: "create-project" as const,
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER" as const,
    expectedVersion: 0 as const,
    title: "Large import",
    public: false,
    repositoryId: "repo",
    teamId: null,
    importIssues: "ALL" as const,
  };
  const receipt = await projects.execute({ userId: "owner" }, command, 10);
  assert.equal(receipt.data.importedItems, 100);
  assert.equal(receipt.data.importPending, true);
  assert.equal((await worker.once(20, 11)).importedItems, 1);
  assert.equal((await worker.once(20, 12)).importedItems, 0);
  const view = await projects.view({ userId: "owner" }, receipt.projectId);
  assert.equal(view.items.length, 101);
  assert.equal(new Set(view.items.map((item) => item.issue?.id)).size, 101);
  assert.deepEqual(
    view.items.map((item) => item.position),
    Array.from({ length: 101 }, (_, index) => index),
  );
  assert.deepEqual(await projects.execute({ userId: "owner" }, command, 13), receipt);
});
