import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryManagementStore } from "../src/adapters/postgres/management.js";
import { PostgresRepositorySubscriptionStore } from "../src/adapters/postgres/subscription.js";
import type { RepositorySubscriptionStore } from "../src/application/ports/subscription.js";
import { createRepositorySubscription } from "../src/application/subscription.js";
import { RepositoryError } from "../src/domain.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, id]);
  });
}

test("Repository subscription accepts only the exact FPT states", async () => {
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
        state: "SUBSCRIBED",
        version: 1,
        at: 10,
      } as const;
    },
  } as RepositorySubscriptionStore;
  const subscription = createRepositorySubscription({
    activeUser: async () => ({ id: "viewer" }),
    store: () => store,
    now: () => 10,
  });

  await subscription.execute("subject", {
    action: "set",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 0,
    state: "SUBSCRIBED",
  });
  assert.equal((calls[0]?.[1] as { state?: string }).state, "SUBSCRIBED");

  await assert.rejects(
    subscription.execute("subject", {
      action: "set",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 1,
      state: "subscribed",
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

test("Watch state is replay-safe, grants no access and survives independent access changes", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner");
  await activeUser(db, "viewer");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Public','public',1)",
  );

  const store = new PostgresRepositorySubscriptionStore(db);
  assert.deepEqual(await store.view("viewer", { repositoryId: "repo" }), {
    repository: {
      id: "repo",
      actorUserId: "viewer",
      ownerLogin: "owner",
      name: "Public",
    },
    state: "UNSUBSCRIBED",
    version: 0,
  });

  const command = {
    action: "set" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 0,
    state: "SUBSCRIBED" as const,
  };
  const subscribed = await store.execute("viewer", command, 10);
  assert.deepEqual(subscribed, {
    requestId: command.requestId,
    repositoryId: "repo",
    state: "SUBSCRIBED",
    version: 1,
    at: 10,
  });
  assert.deepEqual(await store.execute("viewer", command, 11), subscribed);

  await assert.rejects(
    store.execute("viewer", { ...command, state: "IGNORED" }, 12),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  const grants = await pg.query(
    "select principal_id from app_private.repository_access where repository_id='repo' and principal_id='viewer'",
  );
  assert.deepEqual(grants.rows, []);
  const stars = await pg.query(
    "select user_id from app_private.repository_stars where repository_id='repo' and user_id='viewer'",
  );
  assert.deepEqual(stars.rows, []);

  const management = new PostgresRepositoryManagementStore(db);
  await management.execute(
    "owner",
    {
      action: "visibility",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 1,
      visibility: "private",
    },
    20,
  );
  await assert.rejects(
    store.view("viewer", { repositoryId: "repo" }),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
  await assert.rejects(
    store.execute(
      "viewer",
      {
        action: "set",
        requestId: "33333333-3333-4333-8333-333333333333",
        repositoryId: "repo",
        expectedVersion: 1,
        state: "IGNORED",
      },
      21,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values('repo','viewer','read',1)",
  );
  assert.equal((await store.view("viewer", { repositoryId: "repo" })).state, "SUBSCRIBED");
  const ignored = await store.execute(
    "viewer",
    {
      action: "set",
      requestId: "44444444-4444-4444-8444-444444444444",
      repositoryId: "repo",
      expectedVersion: 1,
      state: "IGNORED",
    },
    22,
  );
  assert.equal(ignored.state, "IGNORED");
  assert.equal(ignored.version, 2);
});

test("first-time Watch writes serialize by User and Repository", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner");
  await activeUser(db, "viewer");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo-race','owner','USER','Race','public',1)",
  );

  const store = new PostgresRepositorySubscriptionStore(db);
  const results = await Promise.allSettled([
    store.execute(
      "viewer",
      {
        action: "set",
        requestId: "55555555-5555-4555-8555-555555555555",
        repositoryId: "repo-race",
        expectedVersion: 0,
        state: "SUBSCRIBED",
      },
      30,
    ),
    store.execute(
      "viewer",
      {
        action: "set",
        requestId: "66666666-6666-4666-8666-666666666666",
        repositoryId: "repo-race",
        expectedVersion: 0,
        state: "IGNORED",
      },
      31,
    ),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  assert.ok(rejected);
  assert.ok(rejected.reason instanceof RepositoryError);
  assert.equal(rejected.reason.status, 409);

  const row = await pg.query(
    "select state,version from app_private.repository_subscriptions where repository_id='repo-race' and user_id='viewer'",
  );
  assert.equal(row.rows.length, 1);
  assert.equal((row.rows[0] as { version: number }).version, 1);
});
