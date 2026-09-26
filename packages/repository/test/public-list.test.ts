import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresPublicRepositoryStore } from "../src/adapters/postgres/public.js";
import { createPublicRepositories } from "../src/application/public.js";

test("public Repository list exposes only public owner resources with a deterministic limit", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "public-owner",
    "active",
    1,
  ]);
  await pg.query("select app_private.set_account_login($1,'USER',$2,$3)", [
    "public-owner",
    "alice",
    2,
  ]);
  for (const [id, name, visibility] of [
    ["repository-a", "Alpha", "public"],
    ["repository-b", "Beta", "public"],
    ["repository-c", "Private", "private"],
  ] as const) {
    await pg.query(
      "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,$4,1)",
      [id, "public-owner", name, visibility],
    );
  }

  const publicRepositories = createPublicRepositories(new PostgresPublicRepositoryStore(db));
  assert.deepEqual(await publicRepositories.listByOwner("alice", 1), {
    items: [{ id: "repository-a", ownerLogin: "alice", name: "Alpha" }],
    totalCount: 2,
  });
  assert.deepEqual(await publicRepositories.listByOwner("missing", 6), {
    items: [],
    totalCount: 0,
  });
});
