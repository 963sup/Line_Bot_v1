import assert from "node:assert/strict";
import test from "node:test";
import { readManagementView } from "../src/contracts/parse-management-response.js";
import { readNetwork, readProfile } from "../src/contracts/parse-profile-response.js";
import { readChangedStatus, readStatus } from "../src/contracts/parse-status-response.js";

test("Account response codecs preserve nullable profile fields and reject unknown visibility", () => {
  const profile = {
    userId: "user-1",
    displayName: null,
    bio: null,
    avatarRef: null,
    visibility: "private",
    version: 1,
    createdAt: 0,
    updatedAt: 1,
  };
  assert.deepEqual(
    readProfile({ ...profile, privateProviderToken: "not-a-public-field" }),
    profile,
  );
  assert.throws(() => readProfile({ ...profile, visibility: "all" }));
  assert.throws(() => readProfile({ ...profile, updatedAt: Infinity }));
  assert.throws(() =>
    readNetwork({ followers: [{ userId: "user-2", followedAt: "1" }], following: [] }),
  );
});

test("Account status receipts require request identity and retain nullable expiry", () => {
  const status = {
    userId: "user-1",
    message: null,
    emoji: null,
    limitedAvailability: false,
    expiresAt: null,
    version: 1,
    createdAt: 0,
    updatedAt: 1,
  };
  assert.deepEqual(readStatus(status), status);
  assert.deepEqual(readChangedStatus({ ...status, requestId: "request-1" }), {
    ...status,
    requestId: "request-1",
  });
  assert.throws(() => readChangedStatus(status));
  assert.throws(() => readStatus({ ...status, expiresAt: Infinity }));
});

test("Account management codec distinguishes an empty authorized view from missing or corrupt data", () => {
  const empty = { actorId: "user-1", canSuspend: false, users: [], next: null, detail: null };
  assert.deepEqual(readManagementView(empty), empty);
  assert.throws(() => readManagementView({ ...empty, users: null }));
  assert.throws(() => readManagementView({ ...empty, detail: {} }));
});
