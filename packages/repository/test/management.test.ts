import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryManagementStore } from "../src/adapters/postgres/management.js";
import { createRepositoryManagement } from "../src/application/management.js";
import type { RepositoryManagementStore } from "../src/application/ports/management.js";
import { RepositoryError } from "../src/domain.js";
import { authorizedRepository } from "../src/postgres/access.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query(
      'insert into users(id,status,status_version,"createdAt") values($1,\'active\',1,1)',
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("Repository management application canonicalizes lifecycle commands", async () => {
  const calls: unknown[][] = [];
  const store = {
    view: async () => {
      throw new Error("not used");
    },
    execute: async (...args: unknown[]) => {
      calls.push(args);
      return {
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        action: "rename",
        name: "Renamed",
        visibility: "private",
        archived: false,
        version: 2,
        at: 10,
      } as const;
    },
  } as RepositoryManagementStore;
  const management = createRepositoryManagement({
    activeUser: async () => ({ id: "owner" }),
    store: () => store,
    now: () => 10,
  });

  await management.execute("subject", {
    action: "rename",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 1,
    name: "  Renamed  ",
  });
  assert.deepEqual(calls[0], [
    "owner",
    {
      action: "rename",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      expectedVersion: 1,
      name: "Renamed",
    },
    10,
  ]);

  await assert.rejects(
    management.execute("subject", {
      action: "visibility",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 2,
      visibility: "friends",
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

test("rename keeps stable identity, follows aliases, preserves history and exact replay", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "alice");
  await activeUser(db, "viewer", "viewer");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Alpha','private',1)",
  );

  const store = new PostgresRepositoryManagementStore(db);
  const rename = {
    action: "rename" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 1,
    name: "Beta",
  };
  const renamed = await store.execute("owner", rename, 10);
  assert.equal(renamed.repositoryId, "repo");
  assert.equal(renamed.name, "Beta");
  assert.equal(renamed.version, 2);
  assert.deepEqual(await store.execute("owner", rename, 11), renamed);

  const followed = await db.transaction((sql) =>
    authorizedRepository(
      sql,
      { userId: "owner" },
      { ownerLogin: "alice", repositoryName: "Alpha" },
    ),
  );
  assert.equal(followed.id, "repo");
  assert.equal(followed.name, "Beta");
  await assert.rejects(
    db.transaction((sql) =>
      authorizedRepository(
        sql,
        { userId: "owner" },
        { ownerLogin: "alice", repositoryName: "Alpha", followRenames: false },
      ),
    ),
    (error) => error instanceof RepositoryError && error.status === 404,
  );

  const restored = await store.execute(
    "owner",
    {
      action: "rename",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 2,
      name: "Alpha",
    },
    12,
  );
  assert.equal(restored.name, "Alpha");
  assert.equal(restored.version, 3);

  await assert.rejects(
    pg.query(
      "select * from app_private.provision_repository($1,$2,$3,'USER',$4,$5)",
      ["repo-2", "owner", "owner", "Beta", "private"],
    ),
    (error: unknown) =>
      (error as { code?: string; constraint?: string }).code === "23505" &&
      (error as { constraint?: string }).constraint === "repository_name_history_reserved",
  );

  const publicResult = await store.execute(
    "owner",
    {
      action: "visibility",
      requestId: "33333333-3333-4333-8333-333333333333",
      repositoryId: "repo",
      expectedVersion: 3,
      visibility: "public",
    },
    13,
  );
  assert.equal(publicResult.version, 4);
  const publicRead = await db.transaction((sql) =>
    authorizedRepository(sql, { userId: "viewer" }, { repositoryId: "repo" }),
  );
  assert.deepEqual(publicRead.permissions, []);

  await assert.rejects(
    store.execute(
      "viewer",
      {
        action: "archive",
        requestId: "44444444-4444-4444-8444-444444444444",
        repositoryId: "repo",
        expectedVersion: 4,
      },
      14,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  const privateResult = await store.execute(
    "owner",
    {
      action: "visibility",
      requestId: "55555555-5555-4555-8555-555555555555",
      repositoryId: "repo",
      expectedVersion: 4,
      visibility: "private",
    },
    15,
  );
  assert.equal(privateResult.version, 5);
  await assert.rejects(
    db.transaction((sql) =>
      authorizedRepository(sql, { userId: "viewer" }, { repositoryId: "repo" }),
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  const archived = await store.execute(
    "owner",
    {
      action: "archive",
      requestId: "66666666-6666-4666-8666-666666666666",
      repositoryId: "repo",
      expectedVersion: 5,
    },
    16,
  );
  assert.equal(archived.archived, true);
  assert.equal(archived.version, 6);
  const unarchived = await store.execute(
    "owner",
    {
      action: "unarchive",
      requestId: "77777777-7777-4777-8777-777777777777",
      repositoryId: "repo",
      expectedVersion: 6,
    },
    17,
  );
  assert.equal(unarchived.archived, false);
  assert.equal(unarchived.version, 7);

  const history = await pg.query(
    "select old_name from app_private.repository_name_history where repository_id='repo' order by lower(old_name)",
  );
  assert.deepEqual(history.rows, [{ old_name: "Alpha" }, { old_name: "Beta" }]);
  const events = await pg.query(
    "select action from app_private.repository_events where repository_id='repo' order by id",
  );
  assert.deepEqual(
    events.rows.map((row) => row.action),
    ["rename", "rename", "visibility", "visibility", "archive", "unarchive"],
  );
});
