import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPublicRepositories } from "../src/application/public.js";
import { PostgresPublicRepositoryStore } from "../src/postgres/public.js";

test("public Repository list and popularity expose only public owner resources deterministically", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
      "public-owner",
      "active",
      1,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "public-owner",
      "alice",
      2,
    ]);
    for (const id of ["fan-a", "fan-b"]) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
    }
  });
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
  await pg.query(
    "insert into app_private.repository_stars(repository_id,user_id,created_at) values($1,$2,$3),($1,$4,$5),($6,$2,$7)",
    ["repository-b", "fan-a", 10, "fan-b", 11, "repository-a", 12],
  );

  const publicRepositories = createPublicRepositories(new PostgresPublicRepositoryStore(db));
  assert.deepEqual(await publicRepositories.listByOwner("alice", 1), {
    items: [{ id: "repository-a", ownerLogin: "alice", name: "Alpha" }],
    totalCount: 2,
  });
  assert.deepEqual(await publicRepositories.popularByOwner("alice", 1), {
    items: [{ id: "repository-b", ownerLogin: "alice", name: "Beta", starCount: 2 }],
    totalCount: 2,
  });
  assert.deepEqual(await publicRepositories.popularByOwner("missing", 6), {
    items: [],
    totalCount: 0,
  });
});
