import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresRepositoryStarListStore } from "../src/adapters/postgres/star-lists.js";
import { PostgresRepositoryStarStore } from "../src/adapters/postgres/stars.js";
import type { RepositoryStarListStore } from "../src/application/ports/star-lists.js";
import { createRepositoryStarLists } from "../src/application/star-lists.js";
import { RepositoryError } from "../src/domain.js";

async function activeUser(
  pg: { query(sql: string, values?: unknown[]): Promise<unknown> },
  id: string,
  login: string,
) {
  await pg.query(
    "insert into app_private.users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
    [id],
  );
  await pg.query("select app_private.set_account_login($1,'USER',$2,1)", [id, login]);
}

test("Repository Star List application canonicalizes commands before persistence", async () => {
  const calls: unknown[][] = [];
  const store = {
    mine: async () => [],
    detail: async () => {
      throw new Error("not used");
    },
    create: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "list", version: 1, visibility: "private", deleted: false } as const;
    },
    execute: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "list", version: 2, visibility: "private", deleted: false } as const;
    },
  } as RepositoryStarListStore;
  const lists = createRepositoryStarLists({
    activeUser: async () => ({ id: "user-a" }),
    store: () => store,
    now: () => 10,
  });

  await lists.create("subject", {
    requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    name: "  Operations  ",
    description: "  Useful repositories  ",
  });
  assert.deepEqual(calls[0], [
    "user-a",
    {
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Operations",
      description: "Useful repositories",
    },
    10,
  ]);

  await lists.command("subject", "list", {
    requestId: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
    action: "add",
    expectedVersion: 1,
    repositoryId: "repo-a",
  });
  assert.deepEqual(calls[1], [
    "user-a",
    {
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      listId: "list",
      action: "add",
      expectedVersion: 1,
      repositoryId: "repo-a",
    },
    10,
  ]);

  await assert.rejects(
    lists.create("subject", {
      requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "List",
      description: "",
      visibility: "public",
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

test("Repository Star Lists preserve replay, versioning, Star dependency and viewer-safe reads", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(pg, "owner", "owner");
  await activeUser(pg, "viewer", "viewer");

  for (const [id, name] of [
    ["repo-a", "Visible"],
    ["repo-b", "Hidden"],
  ] as const) {
    await pg.query(
      "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,'owner','USER',$2,'private',1)",
      [id, name],
    );
  }
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values('repo-a','viewer','read',1)",
  );

  const stars = new PostgresRepositoryStarStore(db);
  await stars.star("owner", "repo-a", 2);
  await stars.star("owner", "repo-b", 3);

  const store = new PostgresRepositoryStarListStore(db);
  const command = {
    requestId: "11111111-1111-4111-8111-111111111111",
    name: "Operations",
    description: "Curated work repositories",
  };
  const created = await store.create("owner", command, 10);
  assert.deepEqual(await store.create("owner", command, 11), created);

  let result = await store.execute(
    "owner",
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      listId: created.id,
      expectedVersion: 1,
      action: "add",
      repositoryId: "repo-a",
    },
    12,
  );
  assert.equal(result.version, 2);

  result = await store.execute(
    "owner",
    {
      requestId: "33333333-3333-4333-8333-333333333333",
      listId: created.id,
      expectedVersion: 2,
      action: "add",
      repositoryId: "repo-b",
    },
    13,
  );
  assert.equal(result.version, 3);

  await assert.rejects(
    store.detail("viewer", created.id),
    (error) => error instanceof RepositoryError && error.status === 404,
  );

  result = await store.execute(
    "owner",
    {
      requestId: "44444444-4444-4444-8444-444444444444",
      listId: created.id,
      expectedVersion: 3,
      action: "publish",
    },
    14,
  );
  assert.deepEqual(result, {
    id: created.id,
    version: 4,
    visibility: "public",
    deleted: false,
  });

  const viewer = await store.detail("viewer", created.id);
  assert.equal(viewer.visibleRepositoryCount, 1);
  assert.equal(viewer.editable, false);
  assert.deepEqual(
    viewer.repositories.map((repository) => repository.id),
    ["repo-a"],
  );

  await assert.rejects(
    store.execute(
      "owner",
      {
        requestId: "55555555-5555-4555-8555-555555555555",
        listId: created.id,
        expectedVersion: 3,
        action: "update",
        name: "Stale",
        description: "",
      },
      15,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );

  await stars.unstar("owner", "repo-a");
  const cascaded = await pg.query(
    "select count(*)::int as count from app_private.repository_star_list_items where list_id=$1 and repository_id='repo-a'",
    [created.id],
  );
  assert.deepEqual(cascaded.rows, [{ count: 0 }]);

  const afterUnstar = await store.detail("viewer", created.id);
  assert.equal(afterUnstar.visibleRepositoryCount, 0);
  assert.deepEqual(afterUnstar.repositories, []);

  const receipts = await pg.query(
    "select count(*)::int as count from app_private.repository_commands where actor='owner'",
  );
  assert.deepEqual(receipts.rows, [{ count: 4 }]);
});

test("Repository Star List add requires an existing Star", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(pg, "owner", "owner");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Repo','private',1)",
  );

  const store = new PostgresRepositoryStarListStore(db);
  const created = await store.create(
    "owner",
    {
      requestId: "66666666-6666-4666-8666-666666666666",
      name: "List",
      description: "",
    },
    1,
  );
  await assert.rejects(
    store.execute(
      "owner",
      {
        requestId: "77777777-7777-4777-8777-777777777777",
        listId: created.id,
        expectedVersion: 1,
        action: "add",
        repositoryId: "repo",
      },
      2,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
});
