import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { repositoryArchived, repositoryScope } from "@line_bot_v1/repository/postgres/access";
import { repositoryLabelIdsExist } from "@line_bot_v1/repository/postgres/resource-management";
import { PostgresDiscussionManagementStore } from "../src/adapters/postgres-management.js";
import { DiscussionError } from "../src/domain.js";

const repositoryAccess = {
  scope: repositoryScope,
  archived: repositoryArchived,
  labelIdsExist: repositoryLabelIdsExist,
};

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
    "select * from app_private.provision_repository('repo','owner','owner','USER','Repo','private')",
  );
  await pg.query(
    `insert into repository_access(repository_id,principal_id,capability,version)
     values('repo','writer','write',1),('repo','reader','read',1)`,
  );
  await pg.exec(`begin;
    insert into repository_labels(id,repository_id,name,color,description,version)
      values('label','repo','question','0366d6','',1);
    select app_private.claim_scoped_namespace_name(
      'repository-label','REPOSITORY','repo','LABEL','label','question',1
    );
    commit;`);
  return fixture;
}

test("Discussion management composes lifecycle, replies, answer, labels, votes, poll and lock", async (t) => {
  const { pg, db } = await setup();
  t.after(() => pg.close());
  const store = new PostgresDiscussionManagementStore(repositoryAccess, db);
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
    categoryId: category.categoryId,
    title: "How?",
    body: "Question",
  };
  const created = await store.execute(writer, createCommand, 11);
  assert.equal(created.version, 1);
  assert.ok(created.discussionId);
  assert.deepEqual(await store.execute(writer, createCommand, 11), created);
  assert.deepEqual(
    (
      await pg.query(
        `select number::int as number,resource_id
         from app_private.number_allocations
         where family='repository-discussion' and scope_id='repo'`,
      )
    ).rows,
    [{ number: 1, resource_id: created.discussionId }],
  );

  const root = await store.execute(
    writer,
    {
      action: "add-comment",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId,
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
      discussionId: created.discussionId,
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
      discussionId: created.discussionId,
      expectedVersion: 3,
      commentId: root.resourceId,
    },
    14,
  );
  await store.execute(
    writer,
    {
      action: "delete-comment",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId,
      expectedVersion: 4,
      commentId: root.resourceId,
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
      discussionId: created.discussionId,
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
      discussionId: created.discussionId,
      expectedVersion: 6,
      subjectKind: "discussion",
      subjectId: created.discussionId,
    },
    17,
  );
  const poll = await store.execute(
    writer,
    {
      action: "create-poll",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId,
      expectedVersion: 7,
      question: "Choose",
      options: ["A", "B"],
    },
    18,
  );
  assert.ok(poll.resourceId);

  const beforeVote = await store.view(writer, "repo", created.discussionId);
  const optionId = beforeVote.poll?.options[0]?.id;
  assert.ok(optionId);
  await store.execute(
    writer,
    {
      action: "add-poll-vote",
      requestId: randomUUID(),
      repositoryId: "repo",
      discussionId: created.discussionId,
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
        discussionId: created.discussionId,
        expectedVersion: 9,
        pollId: poll.resourceId,
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
      discussionId: created.discussionId,
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
        discussionId: created.discussionId,
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
      discussionId: created.discussionId,
      expectedVersion: 10,
      stateReason: "RESOLVED",
    },
    23,
  );

  const view = await store.view(writer, "repo", created.discussionId);
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
  const store = new PostgresDiscussionManagementStore(repositoryAccess, db);
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
  assert.ok(category.categoryId);

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
      categoryId: category.categoryId,
    },
    3,
  );
  assert.equal(adopted.version, 2);

  const after = await store.view({ userId: "writer" }, "repo", "legacy");
  assert.equal(after.discussion?.number, 1);
  assert.equal(after.discussion?.categoryId, category.categoryId);
  assert.deepEqual(
    (
      await pg.query(
        `select number::int as number,resource_id
         from app_private.number_allocations
         where family='repository-discussion' and scope_id='repo'`,
      )
    ).rows,
    [{ number: 1, resource_id: "legacy" }],
  );
});

test("Discussion category releases its scoped slug only after a valid delete", async (t) => {
  const { pg, db } = await setup();
  t.after(() => pg.close());
  const store = new PostgresDiscussionManagementStore(repositoryAccess, db);
  const writer = { userId: "writer" };

  const created = await store.execute(
    writer,
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
    10,
  );
  assert.ok(created.categoryId);
  await store.execute(
    writer,
    {
      action: "delete-category",
      requestId: randomUUID(),
      repositoryId: "repo",
      categoryId: created.categoryId,
      expectedVersion: 1,
    },
    11,
  );
  const replacement = await store.execute(
    writer,
    {
      action: "create-category",
      requestId: randomUUID(),
      repositoryId: "repo",
      expectedVersion: 0,
      name: "Replacement",
      slug: "general",
      description: "",
      emoji: "",
      isAnswerable: false,
    },
    12,
  );
  assert.ok(replacement.categoryId);
  assert.notEqual(replacement.categoryId, created.categoryId);
});

test("Discussion management takes Repository authorization from the host without bypassing errors", async (t) => {
  const { pg, db } = await setup();
  t.after(() => pg.close());
  const denied = new PostgresDiscussionManagementStore(
    {
      ...repositoryAccess,
      scope: async () => {
        throw new RepositoryError(403, "Access denied.");
      },
    },
    db,
  );
  await assert.rejects(
    denied.view({ userId: "writer" }, "repo"),
    (error) => error instanceof DiscussionError && error.status === 403,
  );
  const present = new PostgresDiscussionManagementStore(repositoryAccess, db);
  assert.equal((await present.view({ userId: "writer" }, "repo")).repository.id, "repo");
});

test("Discussion writes recheck access before replay and preserve archive restrictions", async (t) => {
  const { pg, db } = await setup();
  t.after(() => pg.close());
  const store = new PostgresDiscussionManagementStore(repositoryAccess, db);
  const writer = { userId: "writer" };
  const command = {
    action: "create-category" as const,
    requestId: randomUUID(),
    repositoryId: "repo",
    expectedVersion: 0 as const,
    name: "General",
    slug: "general",
    description: "",
    emoji: "",
    isAnswerable: false,
  };
  await assert.rejects(
    store.execute({ userId: "reader" }, command, 10),
    (error) => error instanceof DiscussionError && error.status === 403,
  );
  const receipt = await store.execute(writer, command, 11);
  await pg.query("UPDATE repositories SET is_archived=true WHERE id='repo'");
  assert.deepEqual(await store.execute(writer, command, 12), receipt);
  await assert.rejects(
    store.execute(writer, { ...command, requestId: randomUUID(), slug: "new", name: "New" }, 13),
    (error) => error instanceof DiscussionError && error.status === 409,
  );
  await pg.query(
    "DELETE FROM repository_access WHERE repository_id='repo' AND principal_id='writer'",
  );
  await assert.rejects(
    store.execute(writer, command, 14),
    (error) => error instanceof DiscussionError && error.status === 403,
  );
  assert.deepEqual(
    (await pg.query("SELECT count(*)::int AS count FROM discussion_categories")).rows,
    [{ count: 1 }],
  );
  assert.deepEqual(
    (await pg.query("SELECT count(*)::int AS count FROM discussion_commands")).rows,
    [{ count: 1 }],
  );
});
