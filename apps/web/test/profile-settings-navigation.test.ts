import assert from "node:assert/strict";
import test from "node:test";
import { isOwnProfileLogin } from "../src/app/(public)/_components/profile-settings-action";

test("Profile Settings gear is scoped to the current viewer login", () => {
  assert.equal(isOwnProfileLogin("viewer", "viewer"), true);
  assert.equal(isOwnProfileLogin("other", "viewer"), false);
  assert.equal(isOwnProfileLogin(null, "viewer"), false);
  assert.equal(isOwnProfileLogin(undefined, "viewer"), false);
});
