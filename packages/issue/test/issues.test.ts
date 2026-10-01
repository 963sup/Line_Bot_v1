import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresIssueStore } from "../src/adapters/postgres.js";
import { IssueError } from "../src/domain.js";

test("Issue number is monotonic within each Repository and independent across Repositories", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    for (const id of ["publisher", "assignee"]) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
    }
  });
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-a",
    "publisher",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values($1,$2,'active',1,$3)",
    ["organization-a", "assignee", 3],
  );
  for (const repository of [
    ["repository-a", "Alpha"],
    ["repository-b", "Beta"],
  ] as const) {
    await pg.query(
      "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'ORGANIZATION',$3,'private',1)",
      [repository[0], "organization-a", repository[1]],
    );
    for (const user of ["publisher", "assignee"]) {
      await pg.query(
        "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'write',1)",
        [repository[0], user],
      );
    }
  }

  const store = new PostgresIssueStore(db);
  const create = (repositoryId: string, requestId: string) =>
    store.execute(
      { userId: "publisher" },
      {
        requestId,
        repositoryId,
        action: "create",
        title: "Work",
        criteria: "Done",
        assignee: "assignee",
      },
      10,
    );

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,'private',1)",
    ["repository-user", "publisher", "Personal"],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'write',1)",
    ["repository-user", "assignee"],
  );

  const firstA = await create("repository-a", "11111111-1111-4111-8111-111111111111");
  const secondA = await create("repository-a", "22222222-2222-4222-8222-222222222222");
  const firstB = await create("repository-b", "33333333-3333-4333-8333-333333333333");
  const firstUser = await create("repository-user", "44444444-4444-4444-8444-444444444444");

  assert.equal(firstA.number, 1);
  assert.equal(secondA.number, 2);
  assert.equal(firstB.number, 1);
  assert.equal(firstUser.number, 1);

  const ownerAccess = await pg.query(
    "select permissions from app_private.repository_effective_access where repository_id='repository-user' and user_id='publisher'",
  );
  assert.deepEqual(ownerAccess.rows, [{ permissions: ["admin"] }]);

  const counters = await pg.query(
    "select id,next_issue_number::int as next_issue_number from app_private.repositories order by id",
  );
  assert.deepEqual(counters.rows, [
    { id: "repository-a", next_issue_number: 3 },
    { id: "repository-b", next_issue_number: 2 },
    { id: "repository-user", next_issue_number: 2 },
  ]);
});

test("assigned-work authorization preserves replay, revocation, version and Repository isolation", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    for (const id of ["owner", "publisher", "assignee"]) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
    }
  });
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-a",
    "owner",
    "acme-work",
    "Acme Work",
    2,
  ]);
  for (const repositoryId of ["repository-a", "repository-b"]) {
    await pg.query(
      "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,'organization-a','ORGANIZATION',$2,'private',1)",
      [repositoryId, repositoryId],
    );
    for (const userId of ["publisher", "assignee"]) {
      await pg.query(
        "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'triage',1)",
        [repositoryId, userId],
      );
    }
  }

  const store = new PostgresIssueStore(db);
  const createCommand = {
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    repositoryId: "repository-a",
    action: "create" as const,
    title: "Work",
    criteria: "Done",
    assignee: "assignee",
  };
  const created = await store.execute({ userId: "publisher" }, createCommand, 10);
  assert.deepEqual(await store.execute({ userId: "publisher" }, createCommand, 11), created);

  await assert.rejects(
    store.execute({ userId: "publisher" }, { ...createCommand, repositoryId: "repository-b" }, 12),
    (error) => error instanceof IssueError && error.status === 409,
  );

  await assert.rejects(
    store.execute(
      { userId: "publisher" },
      {
        requestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        repositoryId: "repository-a",
        action: "accept",
        issueId: created.id,
        expectedVersion: 1,
        note: "",
      },
      12,
    ),
    (error) => error instanceof IssueError && error.status === 403,
  );

  const accepted = await store.execute(
    { userId: "assignee" },
    {
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      repositoryId: "repository-a",
      action: "accept",
      issueId: created.id,
      expectedVersion: 1,
      note: "",
    },
    13,
  );
  assert.equal(accepted.version, 2);

  await assert.rejects(
    store.execute(
      { userId: "assignee" },
      {
        requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        repositoryId: "repository-a",
        action: "report",
        issueId: created.id,
        expectedVersion: 1,
        note: "Done",
      },
      14,
    ),
    (error) => error instanceof IssueError && error.status === 409,
  );
  await assert.rejects(
    store.execute(
      { userId: "assignee" },
      {
        requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        repositoryId: "repository-b",
        action: "report",
        issueId: created.id,
        expectedVersion: 2,
        note: "Done",
      },
      15,
    ),
    (error) => error instanceof IssueError && error.status === 404,
  );

  await pg.query(
    "update app_private.repository_access set capability='read',version=version+1 where repository_id='repository-b' and principal_id='publisher'",
  );
  await assert.rejects(
    store.execute(
      { userId: "publisher" },
      {
        ...createCommand,
        requestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        repositoryId: "repository-b",
      },
      16,
    ),
    (error) => error instanceof IssueError && error.status === 403,
  );

  await pg.query(
    "update app_private.repository_access set capability='read',version=version+1 where repository_id='repository-a' and principal_id='assignee'",
  );
  const afterAssigneeDowngrade = await store.snapshot(
    { userId: "publisher" },
    { repositoryId: "repository-a" },
    true,
  );
  assert.deepEqual(afterAssigneeDowngrade.participants, [
    { userId: "publisher", name: "publisher" },
  ]);
  await assert.rejects(
    store.execute(
      { userId: "publisher" },
      {
        ...createCommand,
        requestId: "99999999-9999-4999-8999-999999999999",
      },
      17,
    ),
    (error) => error instanceof IssueError && error.status === 403,
  );

  await pg.query(
    "delete from app_private.repository_access where repository_id='repository-a' and principal_id='publisher'",
  );
  await assert.rejects(
    store.execute({ userId: "publisher" }, createCommand, 18),
    (error) => error instanceof IssueError && error.status === 403,
  );
});
