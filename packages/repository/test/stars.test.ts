import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresRepositoryStarStore } from "../src/adapters/postgres/stars.js";
import type { RepositoryStarStore } from "../src/application/ports/stars.js";
import { createRepositoryStars } from "../src/application/stars.js";
import { IssueError } from "../src/domain.js";

function service(store: Partial<RepositoryStarStore>) {
  return createRepositoryStars({
    activeUser: async () => ({ id: "user-a" }),
    store: () => store as RepositoryStarStore,
    now: () => 456,
  });
}

test("star and unstar use the authenticated User and Repository-owned relationship", async () => {
  const calls: unknown[][] = [];
  const stars = service({
    star: async (...args) => {
      calls.push(["star", ...args]);
    },
    unstar: async (...args) => {
      calls.push(["unstar", ...args]);
    },
  });

  await stars.star("line-subject", "repository-a");
  await stars.unstar("line-subject", "repository-a");
  assert.deepEqual(calls, [
    ["star", "user-a", "repository-a", 456],
    ["unstar", "user-a", "repository-a"],
  ]);
});

test("star rejects an empty Repository identity before touching persistence", async () => {
  let touched = false;
  const stars = service({
    star: async () => {
      touched = true;
    },
  });

  await assert.rejects(
    stars.star("line-subject", " "),
    (error) => error instanceof IssueError && error.status === 400,
  );
  assert.equal(touched, false);
});

test("explore is a read model over accessible repositories rather than a new truth owner", async () => {
  const stars = service({
    explore: async () => [
      {
        id: "repository-a",
        name: "Repository A",
        visibility: "private",
        capability: "read",
        starCount: 3,
        starred: true,
      },
    ],
  });

  assert.deepEqual(await stars.explore("line-subject"), [
    {
      id: "repository-a",
      name: "Repository A",
      visibility: "private",
      capability: "read",
      starCount: 3,
      starred: true,
    },
  ]);
});

test("Postgres stars require current Repository access and Explore stays a read model", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const id of ["repository-owner", "outsider"]) {
    await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      id,
      "active",
      1,
    ]);
  }
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-a",
    "repository-owner",
    "organization-a",
    "Organization A",
    2,
  ]);
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'ORGANIZATION',$3,'private',1)",
    ["repository-a", "organization-a", "Repository A"],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'read',1)",
    ["repository-a", "repository-owner"],
  );

  const store = new PostgresRepositoryStarStore(db);
  await store.star("repository-owner", "repository-a", 10);
  await store.star("repository-owner", "repository-a", 20);

  assert.deepEqual(await store.starred("repository-owner"), [
    {
      id: "repository-a",
      name: "Repository A",
      visibility: "private",
      starredAt: 10,
      starCount: 1,
    },
  ]);
  assert.deepEqual(await store.explore("repository-owner"), [
    {
      id: "repository-a",
      name: "Repository A",
      visibility: "private",
      capability: "read",
      starCount: 1,
      starred: true,
    },
  ]);

  await assert.rejects(
    store.star("outsider", "repository-a", 30),
    (error) => error instanceof IssueError && error.status === 403,
  );
});

test("public Repository lookup resolves Organization login plus Repository name", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "public-repository-owner",
    "active",
    1,
  ]);
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "public-organization",
    "public-repository-owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'ORGANIZATION',$3,'public',1)",
    ["public-repository", "public-organization", "Payroll"],
  );

  const { PostgresPublicRepositoryStore } = await import("../src/adapters/postgres/public.js");
  const store = new PostgresPublicRepositoryStore(db);
  assert.deepEqual(await store.byOwnerAndName("acme", "payroll"), {
    id: "public-repository",
    ownerLogin: "acme",
    name: "Payroll",
  });
  assert.equal(await store.byOwnerAndName("missing", "Payroll"), null);

  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "public-user-owner",
    "active",
    3,
  ]);
  await pg.query("select app_private.set_account_login($1,'USER',$2,$3)", [
    "public-user-owner",
    "alice",
    4,
  ]);
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,'public',1)",
    ["public-user-repository", "public-user-owner", "Notes"],
  );
  assert.deepEqual(await store.byOwnerAndName("alice", "notes"), {
    id: "public-user-repository",
    ownerLogin: "alice",
    name: "Notes",
  });
});
