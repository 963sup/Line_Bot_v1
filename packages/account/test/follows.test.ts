import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresFollowStore } from "../src/adapters/postgres/follows.js";
import { createFollows } from "../src/application/follows.js";
import type { FollowStore } from "../src/application/ports/follows.js";
import { UserError } from "../src/domain/user.js";

function service(store: Partial<FollowStore>, userId = "user-a") {
  return createFollows({
    activeUser: async () => ({ id: userId }),
    store: () => store as FollowStore,
    now: () => 123,
  });
}

test("follow is directional, idempotency is delegated to the owner store, and self-follow is rejected", async () => {
  const calls: unknown[][] = [];
  const follows = service({
    follow: async (...args) => {
      calls.push(args);
    },
  });

  await follows.follow("line-subject", "user-b");
  assert.deepEqual(calls, [["user-a", "user-b", 123]]);
  await assert.rejects(
    follows.follow("line-subject", "user-a"),
    (error) => error instanceof UserError && error.status === 400,
  );
  assert.equal(calls.length, 1);
});

test("followers and following are opposite reads of one Account-owned relationship", async () => {
  const follows = service({
    followers: async (userId) => [{ userId: `${userId}-follower`, followedAt: 10 }],
    following: async (userId) => [{ userId: `${userId}-following`, followedAt: 20 }],
  });

  assert.deepEqual(await follows.followers("line-subject"), [
    { userId: "user-a-follower", followedAt: 10 },
  ]);
  assert.deepEqual(await follows.following("line-subject"), [
    { userId: "user-a-following", followedAt: 20 },
  ]);
});

test("unfollow uses the authenticated User identity and remains idempotent at the store boundary", async () => {
  const calls: unknown[][] = [];
  const follows = service({
    unfollow: async (...args) => {
      calls.push(args);
    },
  });

  await follows.unfollow("line-subject", "user-b");
  assert.deepEqual(calls, [["user-a", "user-b"]]);
});

test("Postgres follow persistence keeps one directional edge and rejects self-follow", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const id of ["user-a", "user-b"]) {
    await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      id,
      "active",
      1,
    ]);
  }

  const store = new PostgresFollowStore(db);
  await store.follow("user-a", "user-b", 10);
  await store.follow("user-a", "user-b", 20);
  assert.deepEqual(await store.following("user-a"), [{ userId: "user-b", followedAt: 10 }]);
  assert.deepEqual(await store.followers("user-b"), [{ userId: "user-a", followedAt: 10 }]);

  await assert.rejects(
    pg.query(
      "insert into app_private.user_follows(follower_user_id,followed_user_id,created_at) values($1,$1,$2)",
      ["user-a", 30],
    ),
  );
});
