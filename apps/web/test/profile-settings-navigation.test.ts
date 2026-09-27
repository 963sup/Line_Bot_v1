import assert from "node:assert/strict";
import test from "node:test";
import { resolveProfileDestination } from "../src/app/(mobile)/profile/profile-resolver";
import {
  isOwnProfileLogin,
  isVerifiedSelfUser,
} from "../src/app/(public)/_components/profile-viewer";

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
