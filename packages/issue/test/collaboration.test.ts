import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createObjects } from "@line_bot_v1/resources/application/use-cases/objects";
import { createPostgresObjectDependencies } from "@line_bot_v1/resources/composition/bootstrap/objects";
import { createPostgresObjectReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/references";
import { PostgresIssueCollaborationStore } from "../src/adapters/postgres/collaboration.js";
import { createIssueCollaboration } from "../src/application/collaboration.js";
import type {
  IssueCollaborationCommand,
  IssueCollaborationStore,
} from "../src/contracts/collaboration.js";

test("Issue collaboration parses explicit Object and Revision UUIDs at its boundary", async () => {
  let received: IssueCollaborationCommand | undefined;
  const store: IssueCollaborationStore = {
    view: async () => {
      throw new Error("not used");
    },
    execute: async (_identity, command, now) => {
      received = command;
      return {
        requestId: command.requestId,
        repositoryId: command.repositoryId,
        issueId: command.issueId,
        action: command.action,
        version: command.expectedVersion + 1,
        at: now,
        resourceId: null,
        data: {},
      };
    },
  };
  const collaboration = createIssueCollaboration({
    activeUser: async () => ({ id: "actor" }),
    store: () => store,
    now: () => 10,
  });
  await collaboration.command("subject", {
    action: "set-object-reference",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    issueId: "issue",
    expectedVersion: 1,
    objectId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    revisionId: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
  });
  assert.equal(received?.action, "set-object-reference");
  if (received?.action !== "set-object-reference") throw new Error("Object command not received");
  assert.equal(received.objectId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(received.revisionId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  await assert.rejects(
    collaboration.command("subject", {
      action: "remove-object-reference",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "issue",
      expectedVersion: 1,
      objectId: "not-a-uuid",
    }),
    /Object 識別碼 不正確/,
  );
});

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
    "select * from app_private.provision_repository('repo','actor','org','ORGANIZATION','Repo','private')",
  );
  await pg.query(
    "insert into repository_access(repository_id,principal_id,capability,version) values('repo','reader','read',1)",
  );
  await pg.exec(`begin;
    insert into repository_labels(id,repository_id,name,color,description,version) values('label','repo','bug','ff0000','',1);
    select app_private.claim_scoped_namespace_name('repository-label','REPOSITORY','repo','LABEL','label','bug',1);
    commit;`);
  await pg.exec(`begin;
    select app_private.allocate_number('repository-milestone','REPOSITORY','repo','MILESTONE','milestone',1);
    insert into repository_milestones(id,repository_id,number,title,description,status,due_at,version,created_at,updated_at) values('milestone','repo',1,'M1','','open',null,1,1,1);
    commit;`);
  for (const [id, number] of [
    ["parent", 1],
    ["child", 2],
    ["blocker", 3],
  ] as const) {
    await pg.transaction(async (sql) => {
      await sql.query(
        "select app_private.allocate_number('repository-work-item','REPOSITORY','repo','ISSUE',$1,1)",
        [id],
      );
      await sql.query(
        `insert into issues(
           id,repository_id,number,publisher,title,body,criteria,state,state_reason,
           workflow_status,version,created_at,updated_at
         ) values($1,'repo',$2,'actor',$1,'','', 'OPEN',null,'pending',1,1,1)`,
        [id, number],
      );
    });
  }

  const store = new PostgresIssueCollaborationStore(createPostgresObjectReferenceReader, db);
  const actor = { userId: "actor" };

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
  const related = await store.execute(
    actor,
    {
      action: "add-related",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 6,
      targetIssueId: "child",
    },
    16,
  );
  assert.equal(related.version, 7);
  const childAfterRelated = await store.view(actor, "repo", "child");
  assert.equal(childAfterRelated.version, 2);
  assert.deepEqual(childAfterRelated.relatedIssueIds, ["parent"]);
  await assert.rejects(
    store.execute(
      actor,
      {
        action: "remove-related",
        requestId: randomUUID(),
        repositoryId: "repo",
        issueId: "child",
        expectedVersion: 1,
        targetIssueId: "parent",
      },
      16,
    ),
    /已更新/,
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

  const objectTypeId = randomUUID();
  const objectId = randomUUID();
  const objects = createObjects({ ...createPostgresObjectDependencies(db), now: () => 20 });
  await objects.executeType("actor", {
    action: "create",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    typeId: objectTypeId,
    name: "Requirement",
    description: "",
  });
  const objectCreated = await objects.executeObject("actor", {
    action: "create",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    objectId,
    typeId: objectTypeId,
    name: "Requirement A",
    content: "v1",
  });
  const pinnedRevisionId = objectCreated.result.id;
  const setReference = {
    action: "set-object-reference" as const,
    requestId: randomUUID(),
    repositoryId: "repo",
    issueId: "parent",
    expectedVersion: 8,
    objectId,
    revisionId: pinnedRevisionId,
  };
  const pinned = await store.execute(actor, setReference, 21);
  assert.equal(pinned.version, 9);
  assert.deepEqual(await store.execute(actor, setReference, 21), pinned);
  await assert.rejects(
    store.execute(actor, { ...setReference, requestId: randomUUID(), expectedVersion: 9 }, 22),
    /沒有變更/,
  );
  const editedObject = await objects.executeObject("actor", {
    action: "edit",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 1,
    objectId,
    name: "Requirement A",
    content: "v2",
  });
  const pinnedView = await store.view(actor, "repo", "parent");
  assert.equal(pinnedView.objectReferences[0]?.revisionId, pinnedRevisionId);
  assert.equal(pinnedView.objectReferences[0]?.hasNewerRevision, true);
  await assert.rejects(
    store.execute(actor, { ...setReference, revisionId: editedObject.result.id }, 23),
    /請求編號已用於不同/,
  );
  const updated = await store.execute(
    actor,
    {
      ...setReference,
      requestId: randomUUID(),
      expectedVersion: 9,
      revisionId: editedObject.result.id,
    },
    23,
  );
  assert.equal(updated.version, 10);
  await objects.executeObject("actor", {
    action: "archive",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 2,
    objectId,
  });
  const archivedPin = await store.view(actor, "repo", "parent");
  assert.equal(archivedPin.objectReferences[0]?.archived, true);
  assert.equal(archivedPin.objectReferences[0]?.revisionId, editedObject.result.id);
  const removed = await store.execute(
    actor,
    {
      action: "remove-object-reference",
      requestId: randomUUID(),
      repositoryId: "repo",
      issueId: "parent",
      expectedVersion: 10,
      objectId,
    },
    24,
  );
  assert.equal(removed.version, 11);
  assert.deepEqual((await store.view(actor, "repo", "parent")).objectReferences, []);

  const childEvents = await pg.query(
    "select version,action,data from issue_events where issue_id='child' order by version",
  );
  assert.deepEqual(childEvents.rows, [
    {
      version: 2,
      action: "add-related",
      data: { relatedIssueId: "parent" },
    },
  ]);
});
