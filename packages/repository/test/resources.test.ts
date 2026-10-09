import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryManagementStore } from "../src/adapters/postgres/management.js";
import { PostgresRepositoryResourceStore } from "../src/adapters/postgres/resources.js";
import type { RepositoryResourceStore } from "../src/application/ports/resources.js";
import { createRepositoryResources } from "../src/application/resources.js";
import { RepositoryError } from "../src/domain.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [id, "active", 1]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, login, 2]);
  });
}

async function repositoryFixture() {
  const fixture = await postgresFixture();
  const { pg, db } = fixture;
  for (const [id, login] of [
    ["owner-a", "owner-a"],
    ["owner-b", "owner-b"],
  ] as const) {
    await activeUser(db, id, login);
  }
  for (const id of ["reader", "author"]) await activeUser(db, id);
  for (const repository of [
    ["repo-a", "owner-a", "Alpha", "private"],
    ["repo-b", "owner-b", "Beta", "private"],
  ] as const) {
    await pg.query(
      "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,$4,1)",
      [...repository],
    );
    await pg.query(
      "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'read',1)",
      [repository[0], "reader"],
    );
  }
  return fixture;
}

test("Repository resources validate selectors and typed cursors before persistence", async () => {
  const calls: unknown[][] = [];
  let storeFactories = 0;
  const store = {
    labels: async (...args: Parameters<RepositoryResourceStore["labels"]>) => {
      calls.push(args);
      return {
        repository: { id: "repo-a", ownerLogin: "owner-a", name: "Alpha", permissions: ["read"] },
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
  await resources.labels("line-subject", {
    ownerLogin: "owner-a",
    repositoryName: " Alpha ",
    followRenames: false,
  });
  assert.equal(storeFactories, 2);
  assert.deepEqual(calls[0]?.[0], { userId: "line-subject-user" });
  assert.deepEqual(calls[0]?.[1], { ownerLogin: "owner-a", repositoryName: "Alpha" });
  assert.deepEqual(calls[0]?.[2], { name: "bug", id: "label-a" });
  assert.deepEqual(calls[1]?.[1], {
    ownerLogin: "owner-a",
    repositoryName: "Alpha",
    followRenames: false,
  });

  storeFactories = 0;
  calls.length = 0;
  await assert.rejects(
    resources.labels(
      "line-subject",
      { ownerLogin: "owner-a", repositoryName: "Alpha" },
      JSON.stringify({ at: 1, id: "wrong-cursor" }),
    ),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
  assert.equal(storeFactories, 0);
  assert.equal(calls.length, 0);
});

test("Repository resource stores honor explicit historical locator policy", async (t) => {
  const { pg, db } = await repositoryFixture();
  t.after(() => pg.close());
  const management = new PostgresRepositoryManagementStore(db);
  await management.execute(
    "owner-a",
    {
      action: "rename",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo-a",
      expectedVersion: 1,
      name: "Renamed",
    },
    10,
  );

  const store = new PostgresRepositoryResourceStore(db);
  const identity = { userId: "reader" };
  const alias = { ownerLogin: "owner-a", repositoryName: "Alpha" } as const;
  assert.equal((await store.labels(identity, alias)).repository.name, "Renamed");

  const currentOnly = { ...alias, followRenames: false } as const;
  const notFound = (error: unknown) => error instanceof RepositoryError && error.status === 404;
  await assert.rejects(store.labels(identity, currentOnly), notFound);
  await assert.rejects(store.milestones(identity, currentOnly), notFound);
  await assert.rejects(store.milestone(identity, currentOnly, 1), notFound);
});

test("Repository resource reads recheck Organization Team access qualification", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["org-owner", "team-reader"]) await activeUser(db, id);
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
    (error) => error instanceof RepositoryError && error.status === 404,
  );
});

test("Labels and milestones map canonical Repository-owned data", async (t) => {
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
    labels.labels.map((label) => label.name),
    ["bug", "docs"],
  );

  const openMilestones = await store.milestones(
    { userId: "reader" },
    { repositoryId: "repo-a" },
    "open",
  );
  assert.deepEqual(
    openMilestones.milestones.map((milestone) => milestone.number),
    [3, 2],
  );
  assert.deepEqual(await store.milestone({ userId: "reader" }, { repositoryId: "repo-a" }, 2), {
    repository: { id: "repo-a", ownerLogin: "owner-a", name: "Alpha", permissions: ["read"] },
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
