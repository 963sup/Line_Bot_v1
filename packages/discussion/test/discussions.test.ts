import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresDiscussionReadStore } from "../src/adapters/postgres.js";
import { createDiscussions } from "../src/application/discussions.js";
import type { DiscussionReadStore } from "../src/contracts/output/discussion-read.js";
import { DiscussionError, normalizeDiscussionId } from "../src/domain.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [id, "active", 1]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, login, 2]);
  });
}

async function discussionFixture() {
  const fixture = await postgresFixture();
  const { pg, db } = fixture;
  for (const [id, login] of [
    ["owner-a", "owner-a"],
    ["owner-b", "owner-b"],
  ] as const) {
    await activeUser(db, id, login);
  }
  for (const id of ["reader", "writer", "outsider", "author"]) await activeUser(db, id);
  for (const repository of [
    ["repo-a", "owner-a", "Alpha", "private"],
    ["repo-b", "owner-b", "Beta", "private"],
    ["repo-public", "owner-a", "Public Notes", "public"],
  ] as const) {
    await pg.query(
      "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,$4,1)",
      [...repository],
    );
  }
  for (const repositoryId of ["repo-a", "repo-b"]) {
    await pg.query(
      "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'read',1)",
      [repositoryId, "reader"],
    );
  }
  return fixture;
}

test("Discussion owns its current opaque identifier validation", () => {
  assert.equal(normalizeDiscussionId("discussion-a"), "discussion-a");
  assert.equal(normalizeDiscussionId(""), null);
  assert.equal(normalizeDiscussionId("x".repeat(121)), null);
});

test("Discussion application validates scope and cursor before persistence", async () => {
  const calls: unknown[][] = [];
  let stores = 0;
  const store = {
    list: async (...args: Parameters<DiscussionReadStore["list"]>) => {
      calls.push(args);
      return {
        repository: { id: "repo-a", ownerLogin: "owner-a", name: "Alpha", capability: "read" },
        discussions: [],
        next: null,
      };
    },
  } as unknown as DiscussionReadStore;
  const discussions = createDiscussions({
    activeUser: async (subject) => ({ id: `${subject}-user` }),
    store: () => {
      stores += 1;
      return store;
    },
  });

  await discussions.list(
    "line-subject",
    { ownerLogin: "Owner-A", repositoryName: " Alpha " },
    JSON.stringify({ at: 1, id: "discussion-a" }),
  );
  assert.equal(stores, 1);
  assert.deepEqual(calls[0]?.[0], { userId: "line-subject-user" });
  assert.deepEqual(calls[0]?.[1], { ownerLogin: "owner-a", repositoryName: "Alpha" });
  assert.deepEqual(calls[0]?.[2], { at: 1, id: "discussion-a" });

  stores = 0;
  calls.length = 0;
  await assert.rejects(
    discussions.list(
      "line-subject",
      { ownerLogin: "owner-a", repositoryName: "Alpha" },
      JSON.stringify({ name: "wrong" }),
    ),
    (error) => error instanceof DiscussionError && error.status === 400,
  );
  assert.equal(stores, 0);
  assert.equal(calls.length, 0);
});

test("Discussion resolves active identity before creating the persistence adapter", async () => {
  let stores = 0;
  const discussions = createDiscussions({
    activeUser: async () => {
      throw new Error("inactive");
    },
    store: () => {
      stores += 1;
      return {} as DiscussionReadStore;
    },
  });

  await assert.rejects(
    discussions.list("line-subject", { ownerLogin: "owner-a", repositoryName: "Alpha" }),
    /inactive/,
  );
  assert.equal(stores, 0);
});

test("Discussion reads require current Repository access and never expose public bodies anonymously", async (t) => {
  const { pg, db } = await discussionFixture();
  t.after(() => pg.close());
  await pg.query(
    `insert into app_private.discussions(id,repository_id,author,title,body,category,version,created_at,updated_at)
     values($1,$2,$3,$4,$5,$6,1,$7,$7)`,
    ["discussion-a", "repo-a", "author", "Read me", "Private body", "General", 10],
  );
  await pg.query(
    `insert into app_private.discussions(id,repository_id,author,title,body,category,version,created_at,updated_at)
     values($1,$2,$3,$4,$5,$6,1,$7,$7)`,
    ["discussion-public", "repo-public", "author", "Public title", "Public body", "General", 11],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values('repo-a','writer','read',1)",
  );

  const store = new PostgresDiscussionReadStore(db);
  const readable = await store.detail(
    { userId: "reader" },
    { ownerLogin: "owner-a", repositoryName: "alpha" },
    "discussion-a",
  );
  assert.equal(readable.repository.id, "repo-a");
  assert.equal(readable.discussion.body, "Private body");

  await pg.query(
    "delete from app_private.repository_access where repository_id='repo-a' and principal_id='reader'",
  );
  await assert.rejects(
    store.detail(
      { userId: "reader" },
      { ownerLogin: "owner-a", repositoryName: "alpha" },
      "discussion-a",
    ),
    (error) => error instanceof DiscussionError && error.status === 404,
  );
  await pg.query("update app_private.users set status='suspended' where id='writer'");
  await assert.rejects(
    store.detail(
      { userId: "writer" },
      { ownerLogin: "owner-a", repositoryName: "alpha" },
      "discussion-a",
    ),
    (error) => error instanceof DiscussionError && error.status === 404,
  );
  await assert.rejects(
    store.detail(
      { userId: "outsider" },
      { ownerLogin: "owner-a", repositoryName: "public-notes" },
      "discussion-public",
    ),
    (error) => error instanceof DiscussionError && error.status === 404,
  );
});

test("Discussion list omits body and paginates stable same-time rows by id", async (t) => {
  const { pg, db } = await discussionFixture();
  t.after(() => pg.close());
  for (let index = 1; index <= 21; index += 1) {
    const id = `discussion-${String(index).padStart(2, "0")}`;
    await pg.query(
      `insert into app_private.discussions(id,repository_id,author,title,body,category,version,created_at,updated_at)
       values($1,'repo-a','author',$2,$3,'General',1,100,100)`,
      [id, `Discussion ${index}`, `Body ${index}`],
    );
  }

  const store = new PostgresDiscussionReadStore(db);
  const first = await store.list({ userId: "reader" }, { repositoryId: "repo-a" });
  assert.equal(first.discussions.length, 20);
  assert.equal("body" in first.discussions[0]!, false);
  assert.deepEqual(first.discussions.map((discussion) => discussion.id).slice(0, 3), [
    "discussion-01",
    "discussion-02",
    "discussion-03",
  ]);
  assert.equal(first.discussions.at(-1)?.id, "discussion-20");
  assert.ok(first.next);

  const second = await store.list(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    JSON.parse(first.next!) as { at: number; id: string },
  );
  assert.deepEqual(
    second.discussions.map((discussion) => discussion.id),
    ["discussion-21"],
  );
  assert.equal(second.next, null);
});

test("Discussion detail and comment pagination stay inside one Repository scope", async (t) => {
  const { pg, db } = await discussionFixture();
  t.after(() => pg.close());
  for (const [id, repositoryId] of [
    ["discussion-a", "repo-a"],
    ["discussion-b", "repo-b"],
  ] as const) {
    await pg.query(
      `insert into app_private.discussions(id,repository_id,author,title,body,category,version,created_at,updated_at)
       values($1,$2,'author',$3,$4,'General',1,10,10)`,
      [id, repositoryId, id, `${id} body`],
    );
  }
  for (let index = 1; index <= 51; index += 1) {
    const id = `comment-${String(index).padStart(2, "0")}`;
    await pg.query(
      "insert into app_private.discussion_comments(id,discussion_id,author,body,version,created_at) values($1,'discussion-a','author',$2,1,200)",
      [id, `Comment ${index}`],
    );
  }
  await pg.query(
    "insert into app_private.discussion_comments(id,discussion_id,author,body,version,created_at) values('comment-other','discussion-b','author','Other',1,200)",
  );

  const store = new PostgresDiscussionReadStore(db);
  await assert.rejects(
    store.detail({ userId: "reader" }, { repositoryId: "repo-a" }, "discussion-b"),
    (error) => error instanceof DiscussionError && error.status === 404,
  );

  const first = await store.detail(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    "discussion-a",
  );
  assert.equal(first.comments.length, 50);
  assert.equal(first.comments.at(-1)?.id, "comment-50");
  assert.ok(first.next);

  const second = await store.detail(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    "discussion-a",
    JSON.parse(first.next!) as { at: number; id: string },
  );
  assert.deepEqual(
    second.comments.map((entry) => entry.id),
    ["comment-51"],
  );
});
