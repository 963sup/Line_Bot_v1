import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryDiscoveryStore } from "../src/adapters/postgres/discovery.js";

test("Repository discovery ranks current Stars and rechecks Repository access", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    for (const [id, login, at] of [
      ["viewer", "viewer", 1],
      ["owner", "acme", 2],
      ["peer", "peer", 3],
    ] as const) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        at,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, login, at]);
    }
  });

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,'private',1)",
    ["repository-a", "owner", "Operations"],
  );
  for (const userId of ["viewer", "peer"]) {
    await pg.query(
      "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'read',1)",
      ["repository-a", userId],
    );
  }
  await pg.query(
    "insert into app_private.repository_stars(repository_id,user_id,created_at) values($1,$2,$3),($1,$4,$5),($1,$6,$7)",
    ["repository-a", "viewer", 90, "owner", 95, "peer", 70],
  );

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'USER',$3,'private',1)",
    ["repository-b", "owner", "Hidden"],
  );
  await pg.query(
    "insert into app_private.repository_stars(repository_id,user_id,created_at) values($1,$2,$3)",
    ["repository-b", "owner", 91],
  );
  await pg.query(
    `insert into app_private.repository_star_lists(
       id,owner_user_id,name,description,visibility,version,created_at,updated_at
     ) values('list-a','owner','Operations List','Curated operations','public',1,90,97)`,
  );
  await pg.query(
    `insert into app_private.repository_star_list_items(
       list_id,owner_user_id,repository_id,added_at
     ) values('list-a','owner','repository-a',94),('list-a','owner','repository-b',95)`,
  );

  const store = new PostgresRepositoryDiscoveryStore(db);
  assert.deepEqual(
    await store.snapshot("viewer", {
      recentSince: 80,
      trendingLimit: 20,
    }),
    {
      trending: [
        {
          id: "repository-a",
          ownerLogin: "acme",
          name: "Operations",
          visibility: "private",
          permissions: ["read"],
          recentStarCount: 2,
          starCount: 3,
          starred: true,
        },
      ],
    },
  );

  assert.deepEqual(await store.publishedStarLists("viewer", 20), [
    {
      id: "list-a",
      ownerLogin: "acme",
      name: "Operations List",
      description: "Curated operations",
      visibleRepositoryCount: 1,
      updatedAt: 97,
      repositories: [
        {
          id: "repository-a",
          ownerLogin: "acme",
          name: "Operations",
        },
      ],
    },
  ]);

  await pg.query(
    "delete from app_private.repository_access where repository_id=$1 and principal_id=$2",
    ["repository-a", "viewer"],
  );
  assert.deepEqual(
    await store.snapshot("viewer", {
      recentSince: 80,
      trendingLimit: 20,
    }),
    { trending: [] },
  );
  assert.deepEqual(await store.publishedStarLists("viewer", 20), []);
});
