import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnProfileLogin,
  isVerifiedSelfUser,
} from "../src/app/(public)/_components/profile-viewer";
import { resolveProfileDestination } from "../src/modules/account/profile-destination";
import {
  clearVerifiedProfileEntry,
  readVerifiedProfileEntry,
  rememberVerifiedProfileEntry,
} from "../src/modules/account/profile-entry-handoff";

test("Profile Settings gear is scoped to the current viewer login", () => {
  assert.equal(isOwnProfileLogin("viewer", "viewer"), true);
  assert.equal(isOwnProfileLogin("other", "viewer"), false);
  assert.equal(isOwnProfileLogin(null, "viewer"), false);
  assert.equal(isOwnProfileLogin(undefined, "viewer"), false);
});

test("private Profile sections require the active viewer's User locator", () => {
  const activeViewer = { id: "user-1", login: "viewer", status: "active" };
  assert.equal(isVerifiedSelfUser(activeViewer, "user-1", "viewer", "USER"), true);
  assert.equal(
    isVerifiedSelfUser({ ...activeViewer, status: "paused" }, "user-1", "viewer", "USER"),
    false,
  );
  assert.equal(
    isVerifiedSelfUser({ ...activeViewer, login: "other" }, "user-1", "viewer", "USER"),
    false,
  );
  assert.equal(isVerifiedSelfUser(activeViewer, "user-2", "viewer", "USER"), false);
  assert.equal(isVerifiedSelfUser(activeViewer, "user-1", "viewer", "ORGANIZATION"), false);
});

test("Profile entry resolves lifecycle before the canonical User URL", () => {
  assert.deepEqual(resolveProfileDestination(null), {
    kind: "redirect",
    href: "/membership/register",
  });
  assert.deepEqual(resolveProfileDestination({ login: "viewer", status: "paused" }), {
    kind: "redirect",
    href: "/membership/restore",
  });
  assert.deepEqual(resolveProfileDestination({ login: "viewer", status: "suspended" }), {
    kind: "suspended",
  });
  assert.deepEqual(resolveProfileDestination({ login: null, status: "active" }), {
    kind: "integrity-unavailable",
  });
  assert.deepEqual(resolveProfileDestination({ login: "viewer", status: "active" }), {
    kind: "redirect",
    href: "/viewer",
  });
});

test("verified Profile entry handoff is isolated by User and login and expires quickly", () => {
  clearVerifiedProfileEntry();
  rememberVerifiedProfileEntry({ userId: "user-1", login: "viewer", token: "token-1" }, 1_000);
  assert.equal(readVerifiedProfileEntry("user-1", "viewer", 1_001)?.token, "token-1");

  assert.equal(readVerifiedProfileEntry("user-2", "other", 1_002), null);
  assert.equal(readVerifiedProfileEntry("user-1", "viewer", 1_003), null);

  rememberVerifiedProfileEntry({ userId: "user-1", login: "viewer", token: "token-2" }, 2_000);
  assert.equal(readVerifiedProfileEntry("user-1", "viewer", 32_001), null);

  rememberVerifiedProfileEntry({ userId: "user-1", login: "viewer", token: "token-3" }, 40_000);
  assert.equal(readVerifiedProfileEntry("user-1", "viewer", 39_999), null);
  clearVerifiedProfileEntry();
});
