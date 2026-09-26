import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresRepositoryCollectionStore } from "../src/adapters/postgres/collection.js";
import type { RepositoryCollectionStore } from "../src/application/ports/collection.js";
import { createRepositoryCollection } from "../src/application/collection.js";

test("Repository collection resolves the active User before reading accessible Repositories", async () => {
  const calls: string[] = [];
  const collection = createRepositoryCollection({
    activeUser: async (subject) => {
      calls.push(subject);
      return { id: "user-a" };
    },
    store: () =>
      ({
        accessible: async (userId: string) => {
          assert.equal(userId, "user-a");
          return [];
        },
      }) satisfies RepositoryCollectionStore,
  });

  assert.deepEqual(await collection.accessible("line-subject"), []);
  assert.deepEqual(calls, ["line-subject"]);
});

test("Postgres Repository collection returns only current effective access", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "repository-viewer",
    "active",
    1,
  ]);
  await pg.query("select app_private.set_account_login($1,'USER',$2,$3)", [
    "repository-viewer",
    "viewer",
    2,
  ]);
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,'private',1)",
    ["repository-a", "repository-viewer", "Operations"],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'admin',1)",
    ["repository-a", "repository-viewer"],
  );

  const store = new PostgresRepositoryCollectionStore(db);
  assert.deepEqual(await store.accessible("repository-viewer"), [
    {
      id: "repository-a",
      ownerLogin: "viewer",
      name: "Operations",
      capability: "admin",
    },
  ]);
});
