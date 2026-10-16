import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresUserProfileStatusPersistence } from "../src/adapters/outbound/persistence/user-profile-status.js";
import {
  createUserProfileStatuses,
  parseUserProfileStatusChange,
} from "../src/application/user-profile-status.js";
import type {
  UserProfileStatus,
  UserProfileStatusStore,
} from "../src/contracts/repositories/user-profile-status.js";
import { UserError } from "../src/domain/user.js";

const input = (requestId = randomUUID()) => ({
  requestId,
  message: "  Heads down  ",
  emoji: " 🎯 ",
  limitedAvailability: true,
  expiresAt: 2_000,
  expectedVersion: 0,
});

test("profile status command normalizes the FPT fields and rejects organization audience", () => {
  const requestId = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
  assert.deepEqual(parseUserProfileStatusChange(input(requestId)), {
    requestId: requestId.toLowerCase(),
    message: "Heads down",
    emoji: "🎯",
    limitedAvailability: true,
    expiresAt: 2_000,
    expectedVersion: 0,
  });
  assert.throws(
    () => parseUserProfileStatusChange({ ...input(), organizationId: "organization-a" }),
    (error) => error instanceof UserError && error.status === 400,
  );
  assert.throws(
    () => parseUserProfileStatusChange({ ...input(), expiresAt: 9_000_000_000_000_000 }),
    (error) => error instanceof UserError && error.status === 400,
  );
});

test("profile status application qualifies self writes and hides expired public projection", async () => {
  const status: UserProfileStatus = {
    userId: "user-a",
    message: "Heads down",
    emoji: "🎯",
    limitedAvailability: true,
    expiresAt: 2_000,
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
  };
  const writes: unknown[][] = [];
  const store: UserProfileStatusStore = {
    read: async () => status,
    readPublic: async (_userId, now) => (now < 2_000 ? status : null),
  };
  const service = createUserProfileStatuses({
    activeUser: async () => ({ id: "user-a" }),
    store: () => store,
    persistence: () => ({
      transact: async (userId, requestId, work) =>
        work({
          active: async () => true,
          replay: async () => null,
          current: async () => null,
          save: async (...args) => {
            writes.push([userId, requestId, ...args]);
            return status;
          },
          record: async () => {},
        }),
    }),
    now: () => 1_500,
  });

  assert.deepEqual(await service.get("line-subject"), status);
  assert.deepEqual(await service.publicByUserId("user-a"), {
    message: "Heads down",
    emoji: "🎯",
    limitedAvailability: true,
    expiresAt: 2_000,
  });
  const changed = await service.change(
    "line-subject",
    input("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
  );
  assert.equal(changed.requestId, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.deepEqual(writes[0], [
    "user-a",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    {
      message: "Heads down",
      emoji: "🎯",
      limitedAvailability: true,
      expiresAt: 2_000,
    },
    0,
    1,
    1_500,
  ]);
});

function serviceWith(store: PostgresUserProfileStatusPersistence, now: () => number) {
  return createUserProfileStatuses({
    activeUser: async () => ({ id: "user-a" }),
    store: () => store,
    persistence: () => store,
    now,
  });
}

test("Postgres profile status persists exact replay, optimistic version and clear", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.transaction(async (sql) => {
    await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "user-a",
      "active",
      1,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "user-a",
      "user-a",
      1,
    ]);
  });
  const store = new PostgresUserProfileStatusPersistence(db);
  let now = 1_000;
  const service = serviceWith(store, () => now);
  const first = input("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const created = await service.change("line-subject", first);
  assert.equal(created.version, 1);
  now = 2_000;
  const second = await service.change("line-subject", {
    ...first,
    requestId: randomUUID(),
    message: "Newer device status",
    expectedVersion: 1,
  });
  assert.equal(second.version, 2);
  now = 9_000;
  assert.deepEqual(
    await service.change("line-subject", first),
    created,
    "exact replay returns its historical receipt",
  );
  assert.deepEqual(await store.read("user-a"), {
    userId: second.userId,
    message: second.message,
    emoji: second.emoji,
    limitedAvailability: second.limitedAvailability,
    expiresAt: second.expiresAt,
    version: second.version,
    createdAt: second.createdAt,
    updatedAt: second.updatedAt,
  });
  await assert.rejects(
    service.change("line-subject", { ...first, requestId: randomUUID(), message: "stale" }),
    (error) => error instanceof UserError && error.status === 409,
  );
  const cleared = await service.change("line-subject", {
    requestId: randomUUID(),
    message: null,
    emoji: null,
    limitedAvailability: false,
    expiresAt: null,
    expectedVersion: 2,
  });
  assert.equal(cleared.version, 3);
  assert.equal(cleared.message, null);
  assert.equal(await store.readPublic("user-a", 3_000), null);
});

test("competing initial profile status commands serialize per User and only one version zero write wins", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.transaction(async (sql) => {
    await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "user-a",
      "active",
      1,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "user-a",
      "user-a",
      1,
    ]);
  });
  const store = new PostgresUserProfileStatusPersistence(db);
  let now = 1_000;
  const service = serviceWith(store, () => now++);
  const results = await Promise.allSettled([
    service.change("line-subject", input(randomUUID())),
    service.change("line-subject", { ...input(randomUUID()), message: "Competing" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(
    rejected?.status === "rejected" &&
      rejected.reason instanceof UserError &&
      rejected.reason.status === 409,
  );
  assert.equal((await pg.query("select user_id from user_profile_statuses")).rows.length, 1);
  assert.equal(
    (await pg.query("select user_id from user_profile_status_change_receipts")).rows.length,
    1,
  );
});
