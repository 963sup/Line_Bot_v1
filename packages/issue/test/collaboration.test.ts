import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresIssueCollaborationStore } from "../src/adapters/postgres/collaboration.js";
import { createIssueCollaboration } from "../src/application/collaboration.js";

test("Issue collaboration keeps comments, labels, milestone and graphs replay-safe", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const userId of ["actor", "reader"]) {
    await db.transaction(async (sql) => {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        userId,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
        userId,
        userId,
        1,
      ]);
    });
  }

  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "actor",
    "org",
    "Org",
    2,
  ]);
  await pg.query(
    "insert into repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','org','ORGANIZATION','Repo','private',1)",
  );
  await pg.query(
    "insert into repository_access(repository_id,principal_id,capability,version) values('repo','actor','write',1),('repo','reader','read',1)",
  );
  await pg.query(
    "insert into repository_labels(id,repository_id,name,color,description,version) values('label','repo','bug','ff0000','',1)",
  );
  await pg.query(
    "insert into repository_milestones(id,repository_id,number,title,description,status,due_at,version,created_at,updated_at) values('milestone','repo',1,'M1','','open',null,1,1,1)",
  );
  for (const [id, number] of [
    ["parent", 1],
    ["child", 2],
    ["blocker", 3],
  ] as const) {
    await pg.query(
      `insert into issues(
         id,repository_id,number,publisher,title,body,criteria,state,state_reason,
         workflow_status,version,created_at,updated_at
       ) values($1,'repo',$2,'actor',$1,'','', 'OPEN',null,'pending',1,1,1)`,
      [id, number],
    );
  }

  const store = new PostgresIssueCollaborationStore(db);
  const actor = { userId: "actor" };

  const legacyRequestId = randomUUID();
  const legacyRelatedCommand = {
    requestId: legacyRequestId,
    repositoryId: "repo",
    issueId: "child",
    expectedVersion: 1,
    action: "add-related" as const,
    targetIssueId: "blocker",
  };
  const legacyReceipt = {
    requestId: legacyRequestId,
    repositoryId: "repo",
    issueId: "child",
    action: "add-related" as const,
    version: 2,
    at: 9,
    resourceId: "blocker",
    data: { relatedIssueId: "blocker" },
  };
  const legacyFingerprint = createHash("sha256")
    .update(JSON.stringify({ family: "issue-collaboration", command: legacyRelatedCommand }))
    .digest("hex");
  await pg.query(
    `insert into issue_commands(actor,request_id,fingerprint,result)
     values($1,$2,$3,$4::jsonb)`,
    [
      "actor",
      legacyRequestId,
      legacyFingerprint,
      JSON.stringify({
        receiptVersion: 1,
        family: "issue-collaboration",
        result: legacyReceipt,
      }),
    ],
  );
  const application = createIssueCollaboration({
    activeUser: async () => ({ id: "actor" }),
    store: () => store,
    now: () => 999,
  });
  assert.deepEqual(await application.command("actor", legacyRelatedCommand), legacyReceipt);
  await assert.rejects(
    application.command("actor", { ...legacyRelatedCommand, requestId: randomUUID() }),
    /省略版本只允許舊請求 exact replay/,
  );

  const addComment = {
    action: "add-comment" as const,
    requestId: randomUUID(),
    repositoryId: "repo",
    issueId: "parent",
    expectedVersion: 1,
    body: "first",
  };
  const created = await store.execute(actor, addComment, 10);
  assert.equal(created.version, 2);
  assert.ok(created.resourceId);
  assert.deepEqual(await store.execute(actor, addComment, 10), created);

  const labeled = await store.execute(
    actor,
    {
      action: "add-labels",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 2,
      labelIds: ["label"],
    },
    11,
  );
  assert.equal(labeled.version, 3);

  await store.execute(
    actor,
    {
      action: "set-milestone",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 3,
      milestoneId: "milestone",
    },
    12,
  );
  await store.execute(
    actor,
    {
      action: "add-sub-issue",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 4,
      targetIssueId: "child",
    },
    13,
  );
  await assert.rejects(
    store.execute(
      actor,
      {
        action: "add-sub-issue",
        requestId: randomUUID(),
        repositoryId: "repo",
        issueId: "child",
        expectedVersion: 1,
        targetIssueId: "parent",
      },
      14,
    ),
    /cycle/,
  );

  await store.execute(
    actor,
    {
      action: "add-blocked-by",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 5,
      targetIssueId: "blocker",
    },
    15,
  );
  await store.execute(
    actor,
    {
      action: "add-related",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 6,
      targetIssueId: "child",
      targetExpectedVersion: 1,
    },
    16,
  );
  await store.execute(
    actor,
    {
      action: "lock",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 7,
      reason: "RESOLVED",
    },
    17,
  );

  await assert.rejects(
    store.execute(
      { userId: "reader" },
      {
        action: "add-comment",
        requestId: randomUUID(),
        repositoryId: "repo",
        issueId: "parent",
        expectedVersion: 8,
        body: "locked",
      },
      18,
    ),
    /鎖定/,
  );

  const view = await store.view(actor, "repo", "parent");
  assert.equal(view.version, 8);
  assert.equal(view.locked, true);
  assert.equal(view.lockReason, "RESOLVED");
  assert.equal(view.milestoneId, "milestone");
  assert.deepEqual(view.labelIds, ["label"]);
  assert.deepEqual(view.subIssueIds, ["child"]);
  assert.deepEqual(view.blockedByIssueIds, ["blocker"]);
  assert.deepEqual(view.relatedIssueIds, ["child"]);
  assert.equal(view.comments.length, 1);

  const childAfterAdd = await store.view(actor, "repo", "child");
  assert.equal(childAfterAdd.version, 2);
  assert.deepEqual(childAfterAdd.relatedIssueIds, ["parent"]);

  await store.execute(
    actor,
    {
      action: "remove-related",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "child",
      expectedVersion: 2,
      targetIssueId: "parent",
      targetExpectedVersion: 8,
    },
    19,
  );
  const [parentAfterRemove, childAfterRemove] = await Promise.all([
    store.view(actor, "repo", "parent"),
    store.view(actor, "repo", "child"),
  ]);
  assert.equal(parentAfterRemove.version, 9);
  assert.equal(childAfterRemove.version, 3);
  assert.deepEqual(parentAfterRemove.relatedIssueIds, []);
  assert.deepEqual(childAfterRemove.relatedIssueIds, []);

  const mirroredEvents = await pg.query(
    `SELECT issue_id,version,action,data
     FROM issue_events
     WHERE issue_id IN ('parent','child') AND action='remove-related'
     ORDER BY issue_id`,
  );
  assert.deepEqual(mirroredEvents.rows, [
    {
      issue_id: "child",
      version: 3,
      action: "remove-related",
      data: { removedRelatedIssueId: "parent" },
    },
    {
      issue_id: "parent",
      version: 9,
      action: "remove-related",
      data: { removedRelatedIssueId: "child", mirrored: true },
    },
  ]);
});
