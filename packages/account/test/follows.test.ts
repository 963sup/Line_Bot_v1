import assert from "node:assert/strict";
import { test } from "node:test";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createFollows } from "../src/application/follows.js";
import type { FollowStore } from "../src/contracts/output/follows.js";
import { UserError } from "../src/domain/user.js";
import { PostgresFollowStore } from "../src/postgres/follows.js";

function service(store: Partial<FollowStore>, userId = "user-a") {
  const completeStore: FollowStore = {
    follow: async () => {},
    unfollow: async () => {},
    followers: async () => [],
    following: async () => [],
    ...store,
  };
  return createFollows({
    activeUser: async () => ({ id: userId }),
    store: () => completeStore,
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
  await assert.rejects(follows.unfollow("line-subject", "user-a"), {
    status: 400,
    message: "不能取消追蹤自己。",
  });
  assert.equal(calls.length, 1);
});

test("Postgres follow persistence keeps one directional edge and rejects self-follow", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await pg.transaction(async (sql) => {
    for (const id of ["user-a", "user-b", "user-c"]) {
      await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [id, id, 1]);
    }
  });

  const store = new PostgresFollowStore(db);
  await store.follow("user-a", "user-b", 10);
  await store.follow("user-a", "user-b", 20);
  await store.follow("user-a", "user-c", 20);
  await store.follow("user-b", "user-a", 30);
  await store.follow("user-c", "user-a", 40);
  await pg.exec("UPDATE users SET status='paused' WHERE id='user-c'");

  let transactions = 0;
  let queries = 0;
  const countedDatabase: Database = {
    transaction: (work) => {
      transactions++;
      return db.transaction((sql) =>
        work(
          createSql((text, values) => {
            queries++;
            return sql.query(text, values);
          }),
        ),
      );
    },
  };
  const countedStore = new PostgresFollowStore(countedDatabase);
  assert.deepEqual(await countedStore.following("user-a"), [
    { userId: "user-c", followedAt: 20, login: null },
    { userId: "user-b", followedAt: 10, login: "user-b" },
  ]);
  assert.equal(transactions, 1);
  assert.equal(queries, 1);

  transactions = 0;
  queries = 0;
  assert.deepEqual(await countedStore.followers("user-a"), [
    { userId: "user-c", followedAt: 40, login: null },
    { userId: "user-b", followedAt: 30, login: "user-b" },
  ]);
  assert.equal(transactions, 1);
  assert.equal(queries, 1);

  await assert.rejects(
    pg.query(
      "insert into app_private.user_follows(follower_user_id,followed_user_id,created_at) values($1,$1,$2)",
      ["user-a", 30],
    ),
  );
});
