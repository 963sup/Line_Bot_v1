import assert from "node:assert/strict";
import test from "node:test";
import { accessState } from "../src/shared/presentation/access-state";

test("route access distinguishes identity, incomplete setup, active and suspension", () => {
  assert.equal(accessState(false, "active", "app"), "login");
  assert.equal(accessState(true, null, "app"), "register");
  assert.equal(accessState(true, "paused", "app"), "restore");
  assert.equal(accessState(true, "active", "app"), "allowed");
  assert.equal(accessState(true, null, "onboarding"), "allowed");
  assert.equal(accessState(true, "suspended", "onboarding"), "suspended");
  assert.equal(accessState(true, "admin", "app"), "error");
  assert.equal(accessState(true, undefined, "app"), "error");
});
