import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresDiscussionManagementStore } from "../src/adapters/postgres-management.js";
import { DiscussionError } from "../src/domain.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [id, "active", 1]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
  });
}

async function setup() {
  const fixture = await postgresFixture();
  const { pg, db } = fixture;
  for (const userId of ["owner", "writer", "reader"]) await activeUser(db, userId);
  await pg.query(
    "insert into repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Repo','private',1)",
  );
  await pg.query(
    `insert into repository_access(repository_id,principal_id,capability,version)
     values('repo','writer','write',1),('repo','reader','read',1)`,
  );
  await pg.query(
    `insert into repository_labels(id,repository_id,name,color,description,version)
     values('label','repo','question','0366d6','',1)`,
  );
  return fixture;
}

test("Discussion management composes lifecycle, replies, answer, labels, votes, poll and lock", async (t) => {
  const { pg, db } = await setup();
  t.after(() => pg.close());
  const store = new PostgresDiscussionManagementStore(db);
  const writer = { userId: "writer" };

  const category = await store.execute(
    writer,
    {
      action: "create-category",
      requestId: randomUUID(),
      repositoryId: "repo",
      expectedVersion: 0,
      name: "Q&A",
      slug: "q-a",
      description: "",
      emoji: "",
      isAnswerable: true,
    },
    10,
  );
  assert.equal(category.version, 1);
  assert.ok(category.categoryId);

  const createCommand = {
    action: "create-discussion" as const,
    requestId: randomUUID(),
    repositoryId: "repo",
    expectedVersion: 0 as const,
    categoryId: category.categoryId!,
    title: "How?",
    body: "Question",
  };
  const created = await store.execute(writer, createCommand, 11);
  assert.equal(created.version, 1);
  assert.ok(created.discussionId);
  assert.deepEqual(await store.execute(writer, createCommand, 11), created);

  const root = await store.execute(
    writer,
    {
      action: "add-comment",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 1,
      body: "Root answer",
      replyToId: null,
    },
    12,
  );
  const reply = await store.execute(
    writer,
    {
      action: "add-comment",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 2,
      body: "Follow-up",
      replyToId: root.resourceId,
    },
    13,
  );
  assert.ok(root.resourceId);
  assert.ok(reply.resourceId);

  await store.execute(
    writer,
    {
      action: "mark-answer",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 3,
      commentId: root.resourceId!,
    },
    14,
  );
  await store.execute(
    writer,
    {
      action: "delete-comment",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 4,
      commentId: root.resourceId!,
      commentVersion: 1,
    },
    15,
  );

  await store.execute(
    writer,
    {
      action: "add-labels",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 5,
      labelIds: ["label"],
    },
    16,
  );
  await store.execute(
    writer,
    {
      action: "add-upvote",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 6,
      subjectKind: "discussion",
      subjectId: created.discussionId!,
    },
    17,
  );
  const poll = await store.execute(
    writer,
    {
      action: "create-poll",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 7,
      question: "Choose",
      options: ["A", "B"],
    },
    18,
  );
  assert.ok(poll.resourceId);

  const beforeVote = await store.view(writer, "repo", created.discussionId!);
  const optionId = beforeVote.poll?.options[0]?.id;
  assert.ok(optionId);
  await store.execute(
    writer,
    {
      action: "add-poll-vote",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 8,
      optionId,
    },
    19,
  );
  await assert.rejects(
    store.execute(
      writer,
      {
        action: "replace-poll-options",
        requestId: randomUUID(),
        repositoryId: "repo",
        discussionId: created.discussionId!,
        expectedVersion: 9,
        pollId: poll.resourceId!,
        pollVersion: 1,
        options: ["C", "D"],
      },
      20,
    ),
    (error) => error instanceof DiscussionError && error.status === 409,
  );

  await store.execute(
    writer,
    {
      action: "lock",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 9,
      reason: "RESOLVED",
    },
    21,
  );
  await assert.rejects(
    store.execute(
      { userId: "reader" },
      {
        action: "add-comment",
        requestId: randomUUID(),
        repositoryId: "repo",
        discussionId: created.discussionId!,
        expectedVersion: 10,
        body: "Blocked by lock",
        replyToId: null,
      },
      22,
    ),
    (error) => error instanceof DiscussionError && error.status === 409,
  );
  await store.execute(
    writer,
    {
      action: "close-discussion",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId!,
      expectedVersion: 10,
      stateReason: "RESOLVED",
    },
    23,
  );

  const view = await store.view(writer, "repo", created.discussionId!);
  assert.equal(view.discussion?.number, 1);
  assert.equal(view.discussion?.state, "CLOSED");
  assert.equal(view.discussion?.locked, true);
  assert.equal(view.answer, null);
  assert.deepEqual(view.labelIds, ["label"]);
  assert.equal(view.discussionUpvoteCount, 1);
  assert.equal(view.viewerHasUpvotedDiscussion, true);
  assert.equal(view.poll?.totalVoteCount, 1);
  assert.equal(view.poll?.viewerHasVoted, true);
  assert.equal(view.comments[0]?.deleted, true);
  assert.equal(view.comments[0]?.body, null);
  assert.equal(view.comments[1]?.replyToId, root.resourceId);
  assert.equal(view.comments[1]?.body, "Follow-up");
});

test("Legacy Discussion adoption is explicit and allocates stable repository number", async (t) => {
  const { pg, db } = await setup();
  t.after(() => pg.close());
  await pg.query(
    `insert into discussions(
       id,repository_id,author,title,body,category,version,created_at,updated_at
     ) values('legacy','repo','writer','Legacy','Body','General',1,1,1)`,
  );
  const store = new PostgresDiscussionManagementStore(db);
  const category = await store.execute(
    { userId: "writer" },
    {
      action: "create-category",
      requestId: randomUUID(),
      repositoryId: "repo",
      expectedVersion: 0,
      name: "General",
      slug: "general",
      description: "",
      emoji: "",
      isAnswerable: false,
    },
    2,
  );

  const before = await store.view({ userId: "writer" }, "repo", "legacy");
  assert.equal(before.discussion?.number, null);
  assert.equal(before.discussion?.categoryId, null);
  assert.equal(before.discussion?.category, "General");

  const adopted = await store.execute(
    { userId: "writer" },
    {
      action: "adopt-discussion",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: "legacy",
      expectedVersion: 1,
      categoryId: category.categoryId!,
    },
    3,
  );
  assert.equal(adopted.version, 2);

  const after = await store.view({ userId: "writer" }, "repo", "legacy");
  assert.equal(after.discussion?.number, 1);
  assert.equal(after.discussion?.categoryId, category.categoryId);
});
