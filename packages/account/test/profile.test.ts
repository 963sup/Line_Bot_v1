import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresUserProfileStore } from "../src/adapters/postgres/profile.js";
import type { UserProfile, UserProfileStore } from "../src/application/ports/profile.js";
import { createUserProfiles, parseUserProfileUpdate } from "../src/application/profile.js";
import { UserError } from "../src/domain/user.js";

test("profile use case owns presentation metadata only", async () => {
  const calls: unknown[][] = [];
  const profiles = createUserProfiles({
    activeUser: async () => ({ id: "user-a" }),
    store: () =>
      ({
        save: async (...args: unknown[]) => {
          calls.push(args);
          return {
            userId: "user-a",
            displayName: "Alice",
            bio: null,
            avatarRef: null,
            visibility: "private",
            version: 1,
            createdAt: 10,
            updatedAt: 10,
          };
        },
      }) as UserProfileStore,
    now: () => 10,
  });

  await profiles.update("line-subject", {
    displayName: "  Alice  ",
    bio: "",
    visibility: "private",
    expectedVersion: 0,
  });
  assert.deepEqual(calls, [
    [
      "user-a",
      {
        displayName: "Alice",
        bio: null,
        visibility: "private",
        expectedVersion: 0,
      },
      10,
    ],
  ]);
});

test("profile parser rejects locator and unsupported fields", () => {
  assert.throws(
    () =>
      parseUserProfileUpdate({
        login: "alice",
        displayName: "A",
        bio: null,
        visibility: "public",
        expectedVersion: 0,
      }),
    (error) => error instanceof UserError && error.status === 400,
  );
  assert.throws(
    () =>
      parseUserProfileUpdate({
        displayName: "A",
        bio: null,
        visibility: "everyone",
        expectedVersion: 0,
      }),
    (error) => error instanceof UserError && error.status === 400,
  );
});

test("Postgres profile save supports create, exact retry, optimistic update and conflict", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "user-a",
    "active",
    1,
  ]);

  const store = new PostgresUserProfileStore(db);
  const input = {
    displayName: "Alice",
    bio: "Hello",
    visibility: "public" as const,
    expectedVersion: 0,
  };
  const created = await store.save("user-a", input, 10);
  assert.equal(created.version, 1);
  assert.equal(created.updatedAt, 10);

  const retry = await store.save("user-a", input, 20);
  assert.deepEqual(retry, created);

  const updated = await store.save("user-a", { ...input, bio: "Updated", expectedVersion: 1 }, 30);
  assert.equal(updated.version, 2);
  assert.equal(updated.bio, "Updated");

  await assert.rejects(
    store.save("user-a", { ...input, bio: "Stale", expectedVersion: 1 }, 40),
    (error) => error instanceof UserError && error.status === 409,
  );
});

test("public profile visibility does not control User identity existence", async () => {
  const publicProfile: UserProfile = {
    userId: "user-a",
    displayName: "Alice",
    bio: null,
    avatarRef: null,
    visibility: "public",
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  };
  let current = publicProfile;
  const profiles = createUserProfiles({
    activeUser: async () => ({ id: "user-a" }),
    store: () =>
      ({
        read: async () => current,
        save: async () => current,
      }) satisfies UserProfileStore,
    now: () => 10,
  });

  assert.equal((await profiles.publicByUserId("user-a"))?.userId, "user-a");
  current = { ...publicProfile, visibility: "private" };
  assert.equal(await profiles.publicByUserId("user-a"), null);
});
