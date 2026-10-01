import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresIssueStore } from "../src/adapters/postgres.js";
import { canIssueRepositoryOperation } from "../src/domain.js";

test("Issue RepositoryPermission policy keeps open/read separate from manage-issue operations", () => {
  const allPermissions = ["read", "triage", "triage_plus", "write", "maintain", "admin"] as const;
  const managementPermissions = ["triage", "triage_plus", "write", "maintain", "admin"] as const;

  for (const operation of ["read", "open", "comment"] as const) {
    for (const permission of allPermissions) {
      assert.equal(canIssueRepositoryOperation([permission], operation), true);
    }
  }

  for (const operation of ["triage", "edit", "close", "assign"] as const) {
    assert.equal(canIssueRepositoryOperation(["read"], operation), false);
    for (const permission of managementPermissions) {
      assert.equal(canIssueRepositoryOperation([permission], operation), true);
    }
  }

  for (const operation of ["manage-resource", "lock-conversation"] as const) {
    for (const permission of allPermissions) {
      assert.equal(canIssueRepositoryOperation([permission], operation), false);
    }
  }
});

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

test("READ can open an Issue while workflow transitions require manage permission and local responsibility", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    for (const id of ["reader", "assignee", "observer", "stranger"]) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
    }
  });
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-policy",
    "reader",
    "policy",
    "Policy",
    2,
  ]);
  for (const userId of ["assignee", "observer", "stranger"]) {
    await pg.query(
      "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values($1,$2,'active',1,$3)",
      ["organization-policy", userId, 3],
    );
  }
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'ORGANIZATION',$3,'public',1)",
    ["repository-policy", "organization-policy", "Policy"],
  );
  for (const [userId, permission] of [
    ["reader", "read"],
    ["assignee", "triage"],
    ["observer", "triage"],
  ] as const) {
    await pg.query(
      "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,$3,1)",
      ["repository-policy", userId, permission],
    );
  }

  const store = new PostgresIssueStore(db);
  const created = await store.execute(
    { userId: "reader" },
    {
      requestId: "55555555-5555-4555-8555-555555555555",
      repositoryId: "repository-policy",
      action: "create",
      title: "Policy work",
      criteria: "Done",
      assignee: "assignee",
    },
    10,
  );
  assert.equal(created.status, "pending");

  await assert.rejects(
    store.execute(
      { userId: "stranger" },
      {
        requestId: "66666666-6666-4666-8666-666666666666",
        repositoryId: "repository-policy",
        action: "create",
        title: "Public is not collaborator access",
        criteria: "Never created",
        assignee: "assignee",
      },
      11,
    ),
    /沒有此 Repository 的存取權限/,
  );

  await assert.rejects(
    store.execute(
      { userId: "observer" },
      {
        requestId: "77777777-7777-4777-8777-777777777777",
        repositoryId: "repository-policy",
        action: "accept",
        issueId: created.id,
        expectedVersion: 1,
        note: "",
      },
      12,
    ),
    /沒有此 Issue 的操作權限/,
  );

  const active = await store.execute(
    { userId: "assignee" },
    {
      requestId: "88888888-8888-4888-8888-888888888888",
      repositoryId: "repository-policy",
      action: "accept",
      issueId: created.id,
      expectedVersion: 1,
      note: "",
    },
    13,
  );
  const review = await store.execute(
    { userId: "assignee" },
    {
      requestId: "99999999-9999-4999-8999-999999999999",
      repositoryId: "repository-policy",
      action: "report",
      issueId: created.id,
      expectedVersion: active.version,
      note: "ready",
    },
    14,
  );

  await assert.rejects(
    store.execute(
      { userId: "reader" },
      {
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        repositoryId: "repository-policy",
        action: "approve",
        issueId: created.id,
        expectedVersion: review.version,
        note: "",
      },
      15,
    ),
    /可管理 Issue 的 Repository permission/,
  );

  await pg.query(
    "update app_private.repository_access set capability='triage',version=2 where repository_id='repository-policy' and principal_id='reader'",
  );
  const completed = await store.execute(
    { userId: "reader" },
    {
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      repositoryId: "repository-policy",
      action: "approve",
      issueId: created.id,
      expectedVersion: review.version,
      note: "",
    },
    16,
  );
  assert.equal(completed.status, "completed");
});
