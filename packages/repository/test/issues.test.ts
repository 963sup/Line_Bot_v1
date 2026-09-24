import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresIssueStore } from "../src/adapters/postgres.js";

test("Issue number is monotonic within each Repository and independent across Repositories", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const id of ["publisher", "assignee"]) {
    await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      id,
      "active",
      1,
    ]);
  }
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

  await pg.query("select app_private.set_account_login($1,'USER',$2,$3)", [
    "publisher",
    "publisher",
    6,
  ]);
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
    "select capability from app_private.repository_effective_access where repository_id='repository-user' and user_id='publisher'",
  );
  assert.deepEqual(ownerAccess.rows, [{ capability: "admin" }]);

  const counters = await pg.query(
    "select id,next_issue_number::int as next_issue_number from app_private.repositories order by id",
  );
  assert.deepEqual(counters.rows, [
    { id: "repository-a", next_issue_number: 3 },
    { id: "repository-b", next_issue_number: 2 },
    { id: "repository-user", next_issue_number: 2 },
  ]);
});
