import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresIssueStore } from "../src/adapters/postgres.js";
import { createIssues } from "../src/application/issues.js";
import type { IssueRepository } from "../src/contracts/repositories/issues.js";
import { canIssueRepositoryOperation, IssueError } from "../src/domain.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [id, "active", 1]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
  });
}

test("Issue RepositoryPermission policy keeps open/workflow separate from generic management", () => {
  const allPermissions = ["read", "triage", "triage_plus", "write", "maintain", "admin"] as const;
  const managementPermissions = ["triage", "triage_plus", "write", "maintain", "admin"] as const;

  for (const operation of ["read", "open", "comment", "workflow"] as const) {
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

  for (const permission of allPermissions) {
    assert.equal(canIssueRepositoryOperation([permission], "manage-resource"), false);
  }
  for (const permission of ["read", "triage", "triage_plus"] as const) {
    assert.equal(canIssueRepositoryOperation([permission], "lock-conversation"), false);
  }
  for (const permission of ["write", "maintain", "admin"] as const) {
    assert.equal(canIssueRepositoryOperation([permission], "lock-conversation"), true);
  }
});

test("Issue application canonicalizes body, assignee sets and exact FPT close reasons", async () => {
  const commands: unknown[] = [];
  const store = {
    execute: async (_identity: unknown, command: unknown) => {
      commands.push(command);
      return {
        id: "issue",
        repositoryId: "repo",
        number: 1,
        publisher: "actor",
        assignees: [],
        title: "Title",
        body: "",
        criteria: "",
        state: "OPEN",
        stateReason: null,
        workflowStatus: "pending",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
  } as unknown as IssueRepository;
  const issues = createIssues({
    activeUser: async () => ({ id: "actor" }),
    store: () => store,
    now: () => 10,
  });

  await issues.command("subject", {
    requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    repositoryId: "repo",
    action: "create",
    title: "  Title  ",
    body: "  Body  ",
    criteria: "  Local criteria  ",
    assigneeIds: ["user-b", "user-a", "user-a"],
  });
  assert.deepEqual(commands[0], {
    requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    repositoryId: "repo",
    action: "create",
    title: "Title",
    body: "Body",
    criteria: "Local criteria",
    assigneeIds: ["user-a", "user-b"],
  });

  await issues.command("subject", {
    requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    repositoryId: "repo",
    action: "close",
    issueId: "issue",
    expectedVersion: 1,
    stateReason: "DUPLICATE",
    note: " duplicate ",
  });
  assert.deepEqual(commands[1], {
    requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    repositoryId: "repo",
    issueId: "issue",
    expectedVersion: 1,
    action: "close",
    stateReason: "DUPLICATE",
    note: "duplicate",
  });

  await assert.rejects(
    issues.command("subject", {
      requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      repositoryId: "repo",
      action: "close",
      issueId: "issue",
      expectedVersion: 1,
      stateReason: "REOPENED",
    }),
    (error) => error instanceof IssueError && error.status === 400,
  );
  await assert.rejects(
    issues.command("subject", {
      requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      repositoryId: "repo",
      action: "add-assignees",
      issueId: "issue",
      expectedVersion: 1,
      assigneeIds: [],
    }),
    (error) => error instanceof IssueError && error.status === 400,
  );
});

test("Issue number is monotonic within each Repository and independent across Repositories", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "publisher");
  await activeUser(db, "assignee");
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
        body: "General description",
        criteria: "Done",
        assigneeIds: ["assignee"],
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
  assert.deepEqual(firstA.assignees, ["assignee"]);
  assert.equal(firstA.state, "OPEN");
  assert.equal(firstA.workflowStatus, "pending");

  const counters = await pg.query(
    "select id,next_issue_number::int as next_issue_number from app_private.repositories order by id",
  );
  assert.deepEqual(counters.rows, [
    { id: "repository-a", next_issue_number: 3 },
    { id: "repository-b", next_issue_number: 2 },
    { id: "repository-user", next_issue_number: 2 },
  ]);
});

test("Issue state, assignment, content and local workflow remain separate axes", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const id of ["reader", "assignee", "second", "manager", "stranger"]) {
    await activeUser(db, id);
  }
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-policy",
    "reader",
    "policy",
    "Policy",
    2,
  ]);
  for (const userId of ["assignee", "second", "manager", "stranger"]) {
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
    ["assignee", "read"],
    ["second", "read"],
    ["manager", "triage"],
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
      body: "General body",
      criteria: "Local acceptance",
      assigneeIds: [],
    },
    10,
  );
  assert.deepEqual(created.assignees, []);
  assert.equal(created.state, "OPEN");
  assert.equal(created.stateReason, null);
  assert.equal(created.workflowStatus, "pending");

  const publicRead = await store.snapshot(
    { userId: "stranger" },
    { repositoryId: "repository-policy" },
    true,
  );
  assert.equal(publicRead.issues[0]?.id, created.id);
  assert.deepEqual(publicRead.repositories, []);
  assert.deepEqual(publicRead.participants, []);

  await assert.rejects(
    store.execute(
      { userId: "reader" },
      {
        requestId: "66666666-6666-4666-8666-666666666666",
        repositoryId: "repository-policy",
        action: "add-assignees",
        issueId: created.id,
        expectedVersion: 1,
        assigneeIds: ["assignee"],
      },
      11,
    ),
    /不允許此 Issue 操作/,
  );

  const assignCommand = {
    requestId: "77777777-7777-4777-8777-777777777777",
    repositoryId: "repository-policy",
    action: "add-assignees" as const,
    issueId: created.id,
    expectedVersion: 1,
    assigneeIds: ["assignee", "reader", "second"],
  };
  const assigned = await store.execute({ userId: "manager" }, assignCommand, 12);
  assert.deepEqual(assigned.assignees, ["assignee", "reader", "second"]);
  assert.equal(assigned.version, 2);
  assert.deepEqual(await store.execute({ userId: "manager" }, assignCommand, 13), assigned);

  await assert.rejects(
    store.execute(
      { userId: "manager" },
      {
        requestId: "88888888-8888-4888-8888-888888888888",
        repositoryId: "repository-policy",
        action: "accept",
        issueId: created.id,
        expectedVersion: 2,
        note: "",
      },
      14,
    ),
    /本地工作流程操作權限/,
  );

  const active = await store.execute(
    { userId: "assignee" },
    {
      requestId: "99999999-9999-4999-8999-999999999999",
      repositoryId: "repository-policy",
      action: "accept",
      issueId: created.id,
      expectedVersion: 2,
      note: "",
    },
    15,
  );
  const review = await store.execute(
    { userId: "assignee" },
    {
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      repositoryId: "repository-policy",
      action: "report",
      issueId: created.id,
      expectedVersion: active.version,
      note: "ready",
    },
    16,
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
    17,
  );
  assert.equal(completed.workflowStatus, "completed");
  assert.equal(completed.state, "OPEN");

  const edited = await store.execute(
    { userId: "manager" },
    {
      requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      repositoryId: "repository-policy",
      action: "edit",
      issueId: created.id,
      expectedVersion: completed.version,
      title: "Renamed policy work",
      body: "Updated body",
      criteria: "",
    },
    18,
  );
  assert.equal(edited.title, "Renamed policy work");
  assert.equal(edited.body, "Updated body");
  assert.equal(edited.criteria, "");
  assert.deepEqual(edited.assignees, completed.assignees);
  assert.equal(edited.state, "OPEN");

  await assert.rejects(
    store.execute(
      { userId: "reader" },
      {
        requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        repositoryId: "repository-policy",
        action: "edit",
        issueId: created.id,
        expectedVersion: edited.version,
        body: "READ cannot edit",
      },
      19,
    ),
    /不允許此 Issue 操作/,
  );

  const closed = await store.execute(
    { userId: "manager" },
    {
      requestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      repositoryId: "repository-policy",
      action: "close",
      issueId: created.id,
      expectedVersion: edited.version,
      stateReason: "COMPLETED",
      note: "finished",
    },
    20,
  );
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.stateReason, "COMPLETED");
  assert.equal(closed.workflowStatus, "completed");

  const reopened = await store.execute(
    { userId: "manager" },
    {
      requestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      repositoryId: "repository-policy",
      action: "reopen",
      issueId: created.id,
      expectedVersion: closed.version,
      note: "needs more work",
    },
    21,
  );
  assert.equal(reopened.state, "OPEN");
  assert.equal(reopened.stateReason, "REOPENED");

  const removed = await store.execute(
    { userId: "manager" },
    {
      requestId: "12121212-1212-4212-8212-121212121212",
      repositoryId: "repository-policy",
      action: "remove-assignees",
      issueId: created.id,
      expectedVersion: reopened.version,
      assigneeIds: ["second", "reader"],
    },
    22,
  );
  assert.deepEqual(removed.assignees, ["assignee"]);

  const mineSecond = await store.snapshot(
    { userId: "second" },
    { repositoryId: "repository-policy" },
    true,
    "mine",
  );
  assert.equal(mineSecond.issues.length, 0);

  const eventRows = await pg.query(
    "select action,data from app_private.issue_events where issue_id=$1 order by version",
    [created.id],
  );
  const events = eventRows.rows as Array<{ action: string; data: unknown }>;
  const actions = events.map((row) => row.action);
  assert.deepEqual(actions, [
    "create",
    "add-assignees",
    "accept",
    "report",
    "approve",
    "edit",
    "close",
    "reopen",
    "remove-assignees",
  ]);
  const editEvent = events.find((row) => row.action === "edit") as
    | { data: { changes?: Record<string, unknown> } }
    | undefined;
  assert.deepEqual(Object.keys(editEvent?.data.changes ?? {}).sort(), [
    "body",
    "criteria",
    "title",
  ]);
  const closeEvent = events.find((row) => row.action === "close") as
    | { data: { to?: { state?: string; stateReason?: string } } }
    | undefined;
  assert.deepEqual(closeEvent?.data.to, { state: "CLOSED", stateReason: "COMPLETED" });

  const secondIssue = await store.execute(
    { userId: "reader" },
    {
      requestId: "13131313-1313-4313-8313-131313131313",
      repositoryId: "repository-policy",
      action: "create",
      title: "Close before workflow",
      body: "",
      criteria: "",
      assigneeIds: [],
    },
    23,
  );
  const secondAssigned = await store.execute(
    { userId: "manager" },
    {
      requestId: "14141414-1414-4414-8414-141414141414",
      repositoryId: "repository-policy",
      action: "add-assignees",
      issueId: secondIssue.id,
      expectedVersion: secondIssue.version,
      assigneeIds: ["assignee"],
    },
    24,
  );
  const secondClosed = await store.execute(
    { userId: "manager" },
    {
      requestId: "15151515-1515-4515-8515-151515151515",
      repositoryId: "repository-policy",
      action: "close",
      issueId: secondIssue.id,
      expectedVersion: secondAssigned.version,
      stateReason: "NOT_PLANNED",
      note: "",
    },
    25,
  );
  const closedBlockers = await pg.query(
    `select item_id
     from app_private.user_management_activity
     where user_id='assignee'
       and activity_kind='unfinished-issue'
       and item_id=$1`,
    [secondIssue.id],
  );
  assert.deepEqual(closedBlockers.rows, []);
  await assert.rejects(
    store.execute(
      { userId: "assignee" },
      {
        requestId: "16161616-1616-4616-8616-161616161616",
        repositoryId: "repository-policy",
        action: "accept",
        issueId: secondIssue.id,
        expectedVersion: secondClosed.version,
        note: "",
      },
      26,
    ),
    /先重新開啟/,
  );

  await pg.query(
    "update app_private.repositories set is_archived=true where id='repository-policy'",
  );
  const archivedRead = await store.detail({ userId: "reader" }, created.number, {
    repositoryId: "repository-policy",
  });
  assert.equal(archivedRead.issues[0]?.state, "OPEN");
  await assert.rejects(
    store.execute(
      { userId: "manager" },
      {
        requestId: "17171717-1717-4717-8717-171717171717",
        repositoryId: "repository-policy",
        action: "edit",
        issueId: created.id,
        expectedVersion: removed.version,
        body: "archived write",
      },
      27,
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "status") === 409 &&
      String(Reflect.get(error, "message")).includes("唯讀"),
  );
});

test("Issue stateReason and assignee scope are enforced by persistence invariants", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner");
  await activeUser(db, "other");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Repo','private',1)",
  );
  await pg.query(
    `insert into app_private.issues(
       id,repository_id,number,publisher,title,body,criteria,state,state_reason,workflow_status,version,created_at,updated_at
     ) values('issue','repo',1,'owner','Title','','','OPEN',NULL,'pending',1,1,1)`,
  );

  await assert.rejects(
    pg.query(
      "update app_private.issues set state='CLOSED',state_reason='REOPENED' where id='issue'",
    ),
    (error: unknown) => (error as { code?: string }).code === "23514",
  );
  await pg.query(
    "insert into app_private.issue_assignees(issue_id,user_id,assigned_at) values('issue','owner',2)",
  );
  await assert.rejects(
    pg.query(
      "insert into app_private.issue_assignees(issue_id,user_id,assigned_at) values('issue','missing',2)",
    ),
    (error: unknown) => (error as { code?: string }).code === "23503",
  );
  const rows = await pg.query(
    "select user_id from app_private.issue_assignees where issue_id='issue' order by user_id",
  );
  assert.deepEqual(rows.rows, [{ user_id: "owner" }]);
});

test("pre-parity Issue rows stay readable and materialize without invented history", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "legacy-owner");
  await activeUser(db, "legacy-assignee");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('legacy-repo','legacy-owner','USER','Legacy','private',1)",
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values('legacy-repo','legacy-assignee','read',1)",
  );
  await pg.query(
    `insert into app_private.issues(
       id,repository_id,number,publisher,assignee,title,criteria,status,version,created_at,updated_at
     ) values('legacy-issue','legacy-repo',1,'legacy-owner','legacy-assignee','Legacy work','Original criteria','completed',1,10,10)`,
  );
  await pg.query(
    "insert into app_private.issue_events(issue_id,version,actor,action,note,at) values('legacy-issue',1,'legacy-owner','create','',10)",
  );

  const store = new PostgresIssueStore(db);
  const before = await store.detail({ userId: "legacy-owner" }, 1, {
    repositoryId: "legacy-repo",
  });
  assert.deepEqual(before.issues[0], {
    id: "legacy-issue",
    repositoryId: "legacy-repo",
    number: 1,
    publisher: "legacy-owner",
    assignees: ["legacy-assignee"],
    title: "Legacy work",
    body: "",
    criteria: "Original criteria",
    state: "OPEN",
    stateReason: null,
    workflowStatus: "completed",
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  });
  assert.deepEqual(before.events[0]?.data, {});

  const changed = await store.execute(
    { userId: "legacy-owner" },
    {
      requestId: "18181818-1818-4818-8818-181818181818",
      repositoryId: "legacy-repo",
      action: "edit",
      issueId: "legacy-issue",
      expectedVersion: 1,
      body: "Canonical body",
    },
    20,
  );
  assert.equal(changed.version, 2);
  assert.equal(changed.state, "OPEN");
  assert.equal(changed.stateReason, null);
  assert.equal(changed.workflowStatus, "completed");
  assert.deepEqual(changed.assignees, ["legacy-assignee"]);

  const row = await pg.query(
    `select assignee,status,body,state,state_reason,workflow_status,version
     from app_private.issues where id='legacy-issue'`,
  );
  assert.deepEqual(row.rows, [
    {
      assignee: null,
      status: null,
      body: "Canonical body",
      state: "OPEN",
      state_reason: null,
      workflow_status: "completed",
      version: 2,
    },
  ]);
  const assignments = await pg.query(
    "select user_id,assigned_at from app_private.issue_assignees where issue_id='legacy-issue'",
  );
  assert.deepEqual(assignments.rows, [{ user_id: "legacy-assignee", assigned_at: null }]);

  const events = await pg.query(
    "select version,action,data from app_private.issue_events where issue_id='legacy-issue' order by version",
  );
  assert.deepEqual(events.rows[0], { version: 1, action: "create", data: {} });
  assert.equal((events.rows[1] as { version: number }).version, 2);
  assert.equal((events.rows[1] as { action: string }).action, "edit");
});
