import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresIssueCollaborationStore } from "../src/adapters/postgres/collaboration.js";
import { PostgresIssueTypeStore } from "../src/adapters/postgres/issue-types.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [id, "active", 1]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
  });
}

test("IssueType keeps Organization scope separate from Issue permission and workflow", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const userId of ["owner", "writer", "reader"]) await activeUser(db, userId);
  for (const [organizationId, login] of [
    ["org", "org"],
    ["other-org", "other-org"],
  ] as const) {
    await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
      organizationId,
      "owner",
      login,
      organizationId,
      2,
    ]);
  }
  await pg.query(
    "insert into repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','org','ORGANIZATION','Repo','private',1)",
  );
  await pg.query(
    "insert into repository_access(repository_id,principal_id,capability,version) values('repo','writer','write',1),('repo','reader','read',1)",
  );
  for (const [id, number] of [
    ["issue-a", 1],
    ["issue-b", 2],
  ] as const) {
    await pg.query(
      `insert into issues(
         id,repository_id,number,publisher,title,body,criteria,state,state_reason,
         workflow_status,version,created_at,updated_at
       ) values($1,'repo',$2,'owner',$1,'','', 'OPEN',null,'pending',1,1,1)`,
      [id, number],
    );
  }

  const types = new PostgresIssueTypeStore(db);
  const collaboration = new PostgresIssueCollaborationStore(db);
  const owner = { userId: "owner" };
  const writer = { userId: "writer" };
  const reader = { userId: "reader" };

  const create = {
    action: "create-issue-type" as const,
    requestId: randomUUID(),
    organizationAccountId: "org",
    name: "Task",
    description: "Tracked work",
    color: "BLUE" as const,
    isEnabled: true,
  };
  const created = await types.execute(owner, create, 10);
  assert.equal(created.version, 1);
  assert.deepEqual(await types.execute(owner, create, 10), created);
  const typeId = created.issueTypeId;

  await assert.rejects(
    types.execute(writer, { ...create, requestId: randomUUID(), name: "Forbidden" }, 11),
    /OrganizationOwner/,
  );
  assert.deepEqual(
    (await types.list(owner, "org")).items.map((item) => item.name),
    ["Task"],
  );

  const assigned = await collaboration.execute(
    writer,
    {
      action: "set-issue-type",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "issue-a",
      expectedVersion: 1,
      issueTypeId: typeId,
    },
    12,
  );
  assert.equal(assigned.version, 2);
  assert.equal(assigned.data.timelineEvent, "issue_type_added");

  const readerView = await collaboration.view(reader, "repo", "issue-a");
  assert.equal(readerView.issueType?.id, typeId);
  assert.equal(readerView.issueType?.isEnabled, true);
  await assert.rejects(
    collaboration.execute(
      reader,
      {
        action: "set-issue-type",
        requestId: randomUUID(),
        repositoryId: "repo",
        issueId: "issue-a",
        expectedVersion: 2,
        issueTypeId: null,
      },
      13,
    ),
    /access/,
  );
  assert.deepEqual(
    (await pg.query("select state,workflow_status from issues where id='issue-a'")).rows[0],
    { state: "OPEN", workflow_status: "pending" },
  );

  await assert.rejects(
    types.execute(
      owner,
      {
        action: "delete-issue-type",
        requestId: randomUUID(),
        organizationAccountId: "org",
        issueTypeId: typeId,
        expectedVersion: 1,
      },
      14,
    ),
    /仍被 Issue 使用/,
  );

  const disabled = await types.execute(
    owner,
    {
      action: "update-issue-type",
      requestId: randomUUID(),
      organizationAccountId: "org",
      issueTypeId: typeId,
      expectedVersion: 1,
      isEnabled: false,
    },
    15,
  );
  assert.equal(disabled.version, 2);
  assert.equal((await collaboration.view(writer, "repo", "issue-a")).issueType?.isEnabled, false);

  await assert.rejects(
    collaboration.execute(
      writer,
      {
        action: "set-issue-type",
        requestId: randomUUID(),
        repositoryId: "repo",
        issueId: "issue-b",
        expectedVersion: 1,
        issueTypeId: typeId,
      },
      16,
    ),
    /disabled/,
  );

  const other = await types.execute(
    owner,
    {
      action: "create-issue-type",
      requestId: randomUUID(),
      organizationAccountId: "other-org",
      name: "Other",
      description: null,
      color: "GREEN",
      isEnabled: true,
    },
    17,
  );
  await assert.rejects(
    collaboration.execute(
      writer,
      {
        action: "set-issue-type",
        requestId: randomUUID(),
        repositoryId: "repo",
        issueId: "issue-b",
        expectedVersion: 1,
        issueTypeId: other.issueTypeId,
      },
      18,
    ),
    /Organization scope/,
  );

  const cleared = await collaboration.execute(
    writer,
    {
      action: "set-issue-type",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "issue-a",
      expectedVersion: 2,
      issueTypeId: null,
    },
    19,
  );
  assert.equal(cleared.version, 3);
  assert.equal(cleared.data.timelineEvent, "issue_type_removed");
  assert.equal((await collaboration.view(writer, "repo", "issue-a")).issueType, null);

  const deleted = await types.execute(
    owner,
    {
      action: "delete-issue-type",
      requestId: randomUUID(),
      organizationAccountId: "org",
      issueTypeId: typeId,
      expectedVersion: 2,
    },
    20,
  );
  assert.equal(deleted.version, 3);
  assert.deepEqual((await types.list(owner, "org")).items, []);

  const typeEvents = await pg.query(
    "select version,action from issue_type_events where issue_type_id=$1 order by version",
    [typeId],
  );
  assert.deepEqual(typeEvents.rows, [
    { version: 1, action: "create-issue-type" },
    { version: 2, action: "update-issue-type" },
    { version: 3, action: "delete-issue-type" },
  ]);
  const issueEvents = await pg.query(
    "select data from issue_events where issue_id='issue-a' order by version",
  );
  assert.deepEqual(
    issueEvents.rows.map((row) => row.data.timelineEvent),
    ["issue_type_added", "issue_type_removed"],
  );
});
