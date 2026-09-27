import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresRepositoryResourceStore } from "../src/adapters/postgres/resources.js";
import type { RepositoryResourceStore } from "../src/application/ports/resources.js";
import { createRepositoryResources } from "../src/application/resources.js";
import { IssueError } from "../src/domain.js";

async function activeUser(
  pg: { query(sql: string, values?: unknown[]): Promise<unknown> },
  id: string,
) {
  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    id,
    "active",
    1,
  ]);
}

async function userLogin(
  pg: { query(sql: string, values?: unknown[]): Promise<unknown> },
  id: string,
  login: string,
) {
  await activeUser(pg, id);
  await pg.query("select app_private.set_account_login($1,'USER',$2,$3)", [id, login, 2]);
}

async function repositoryFixture() {
  const fixture = await postgresFixture();
  const { pg } = fixture;
  for (const [id, login] of [
    ["owner-a", "owner-a"],
    ["owner-b", "owner-b"],
  ] as const) {
    await userLogin(pg, id, login);
  }
  for (const id of ["reader", "writer", "outsider", "author"]) {
    await activeUser(pg, id);
  }
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

test("Repository resources validate subject, selector and typed cursors before touching persistence", async () => {
  const calls: unknown[][] = [];
  let storeFactories = 0;
  const store = {
    labels: async (...args: Parameters<RepositoryResourceStore["labels"]>) => {
      calls.push(args);
      return {
        repository: { id: "repo-a", ownerLogin: "owner-a", name: "Alpha", capability: "read" },
        labels: [],
        next: null,
      };
    },
  } as unknown as RepositoryResourceStore;
  const resources = createRepositoryResources({
    activeUser: async (subject) => ({ id: `${subject}-user` }),
    store: () => {
      storeFactories += 1;
      return store;
    },
  });

  await resources.labels(
    "line-subject",
    { ownerLogin: "owner-a", repositoryName: " Alpha " },
    JSON.stringify({ name: "bug", id: "label-a" }),
  );
  assert.equal(storeFactories, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.[0], { userId: "line-subject-user" });
  assert.deepEqual(calls[0]?.[1], { ownerLogin: "owner-a", repositoryName: "Alpha" });
  assert.deepEqual(calls[0]?.[2], { name: "bug", id: "label-a" });

  storeFactories = 0;
  calls.length = 0;
  await assert.rejects(
    resources.labels(
      "line-subject",
      { ownerLogin: "owner-a", repositoryName: "Alpha" },
      JSON.stringify({ at: 1, id: "wrong-cursor" }),
    ),
    (error) => error instanceof IssueError && error.status === 400,
  );
  assert.equal(storeFactories, 0);
  assert.equal(calls.length, 0);

  const rejecting = createRepositoryResources({
    activeUser: async () => {
      throw new IssueError(401, "not signed in");
    },
    store: () => {
      storeFactories += 1;
      return store;
    },
  });
  await assert.rejects(
    rejecting.labels("line-subject", { ownerLogin: "owner-a", repositoryName: "Alpha" }),
    (error) => error instanceof IssueError && error.status === 401,
  );
  assert.equal(storeFactories, 0);
});

test("Repository resource reads require current effective access and never publish public bodies anonymously", async (t) => {
  const { pg, db } = await repositoryFixture();
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

  const store = new PostgresRepositoryResourceStore(db);
  const readable = await store.discussion(
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
    store.discussion(
      { userId: "reader" },
      { ownerLogin: "owner-a", repositoryName: "alpha" },
      "discussion-a",
    ),
    (error) => error instanceof IssueError && error.status === 404,
  );
  await pg.query("update app_private.users set status='suspended' where id='writer'");
  await assert.rejects(
    store.discussion(
      { userId: "writer" },
      { ownerLogin: "owner-a", repositoryName: "alpha" },
      "discussion-a",
    ),
    (error) => error instanceof IssueError && error.status === 404,
  );

  await assert.rejects(
    store.discussion(
      { userId: "outsider" },
      { ownerLogin: "owner-a", repositoryName: "alpha" },
      "discussion-a",
    ),
    (error) => error instanceof IssueError && error.status === 404,
  );
  await assert.rejects(
    store.discussion(
      { userId: "outsider" },
      { ownerLogin: "owner-a", repositoryName: "public-notes" },
      "discussion-public",
    ),
    (error) => error instanceof IssueError && error.status === 404,
  );
});

test("Discussion list omits body and paginates stable same-time rows by id", async (t) => {
  const { pg, db } = await repositoryFixture();
  t.after(() => pg.close());
  for (let index = 1; index <= 21; index += 1) {
    const id = `discussion-${String(index).padStart(2, "0")}`;
    await pg.query(
      `insert into app_private.discussions(id,repository_id,author,title,body,category,version,created_at,updated_at)
       values($1,'repo-a','author',$2,$3,'General',1,100,100)`,
      [id, `Discussion ${index}`, `Body ${index}`],
    );
  }

  const store = new PostgresRepositoryResourceStore(db);
  const first = await store.discussions({ userId: "reader" }, { repositoryId: "repo-a" });
  assert.equal(first.discussions.length, 20);
  assert.equal("body" in first.discussions[0]!, false);
  assert.deepEqual(first.discussions.map((discussion) => discussion.id).slice(0, 3), [
    "discussion-01",
    "discussion-02",
    "discussion-03",
  ]);
  assert.equal(first.discussions.at(-1)?.id, "discussion-20");
  assert.ok(first.next);

  const second = await store.discussions(
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

test("Repository resource reads recheck Organization Team access qualification on every read", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["org-owner", "team-reader", "author"]) {
    await activeUser(pg, id);
  }
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-a",
    "org-owner",
    "octo-org",
    "Octo Org",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('organization-a','team-reader','active',1,3)",
  );
  await pg.query(
    "insert into app_private.teams(id,organization_account_id,name,slug,version,created_by_user_id,created_at) values('team-a','organization-a','Readers','readers',1,'org-owner',4)",
  );
  await pg.query(
    "insert into app_private.team_memberships(team_id,user_id,name,status,version) values('team-a','team-reader','Team Reader','active',1)",
  );
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo-org','organization-a','ORGANIZATION','Shared','private',1)",
  );
  await pg.query(
    "insert into app_private.repository_team_access(repository_id,organization_id,team_id,capability,version) values('repo-org','organization-a','team-a','read',1)",
  );
  await pg.query(
    "insert into app_private.repository_labels(id,repository_id,name,color,description,version) values('label-org','repo-org','team','123abc','Team label',1)",
  );

  const store = new PostgresRepositoryResourceStore(db);
  assert.deepEqual(
    (
      await store.labels(
        { userId: "team-reader" },
        { ownerLogin: "octo-org", repositoryName: "shared" },
      )
    ).labels.map((label) => label.name),
    ["team"],
  );

  await pg.query(
    "update app_private.team_memberships set status='removed' where team_id='team-a' and user_id='team-reader'",
  );
  await assert.rejects(
    store.labels({ userId: "team-reader" }, { ownerLogin: "octo-org", repositoryName: "shared" }),
    (error) => error instanceof IssueError && error.status === 404,
  );

  await pg.query(
    "update app_private.team_memberships set status='active' where team_id='team-a' and user_id='team-reader'",
  );
  await pg.query(
    "update app_private.organization_memberships set status='removed' where organization_account_id='organization-a' and user_id='team-reader'",
  );
  await assert.rejects(
    store.labels({ userId: "team-reader" }, { ownerLogin: "octo-org", repositoryName: "shared" }),
    (error) => error instanceof IssueError && error.status === 404,
  );
});

test("Discussion detail is repository-scoped and comment pagination cannot cross repositories", async (t) => {
  const { pg, db } = await repositoryFixture();
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

  const store = new PostgresRepositoryResourceStore(db);
  await assert.rejects(
    store.discussion({ userId: "reader" }, { repositoryId: "repo-a" }, "discussion-b"),
    (error) => error instanceof IssueError && error.status === 404,
  );

  const first = await store.discussion(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    "discussion-a",
  );
  assert.equal("comments" in first.discussion, false);
  assert.equal(first.comments.length, 50);
  assert.equal(first.comments.at(-1)?.id, "comment-50");
  assert.ok(first.next);

  const second = await store.discussion(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    "discussion-a",
    JSON.parse(first.next!) as { at: number; id: string },
  );
  assert.deepEqual(
    second.comments.map((comment) => comment.id),
    ["comment-51"],
  );
});

test("Labels and milestones map canonical repository data with repository-local milestone numbers", async (t) => {
  const { pg, db } = await repositoryFixture();
  t.after(() => pg.close());
  for (const label of [
    ["label-bug", "bug", "ff0000", "Bug report"],
    ["label-docs", "docs", "00ff00", ""],
  ] as const) {
    await pg.query(
      "insert into app_private.repository_labels(id,repository_id,name,color,description,version) values($1,'repo-a',$2,$3,$4,1)",
      [...label],
    );
  }
  for (const milestone of [
    ["milestone-one", 1, "One", "First", "closed", 1000],
    ["milestone-two", 2, "Two", "Second", "open", null],
    ["milestone-three", 3, "Three", "Third", "open", 3000],
  ] as const) {
    await pg.query(
      `insert into app_private.repository_milestones(
         id,repository_id,number,title,description,status,due_at,version,created_at,updated_at
       ) values($1,'repo-a',$2,$3,$4,$5,$6,1,10,20)`,
      [...milestone],
    );
  }

  const store = new PostgresRepositoryResourceStore(db);
  const labels = await store.labels({ userId: "reader" }, { repositoryId: "repo-a" });
  assert.deepEqual(
    labels.labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
      repositoryId: label.repositoryId,
    })),
    [
      {
        id: "label-bug",
        name: "bug",
        color: "ff0000",
        description: "Bug report",
        repositoryId: "repo-a",
      },
      { id: "label-docs", name: "docs", color: "00ff00", description: "", repositoryId: "repo-a" },
    ],
  );

  const openMilestones = await store.milestones(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    "open",
  );
  assert.deepEqual(
    openMilestones.milestones.map((milestone) => ({
      id: milestone.id,
      number: milestone.number,
      title: milestone.title,
      status: milestone.status,
      dueAt: milestone.dueAt,
    })),
    [
      { id: "milestone-three", number: 3, title: "Three", status: "open", dueAt: 3000 },
      { id: "milestone-two", number: 2, title: "Two", status: "open", dueAt: null },
    ],
  );
  assert.deepEqual(await store.milestone({ userId: "reader" }, { repositoryId: "repo-a" }, 2), {
    repository: { id: "repo-a", ownerLogin: "owner-a", name: "Alpha", capability: "read" },
    milestone: {
      id: "milestone-two",
      repositoryId: "repo-a",
      number: 2,
      title: "Two",
      description: "Second",
      status: "open",
      dueAt: null,
      version: 1,
      createdAt: 10,
      updatedAt: 20,
    },
  });
});
