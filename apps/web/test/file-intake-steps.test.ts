import assert from "node:assert/strict";
import { test } from "node:test";
import { fileIntakeStep } from "../src/modules/file/files-panel";

test("File intake presents only the current real user-controlled step", () => {
  assert.equal(fileIntakeStep(false, null), 1);
  assert.equal(fileIntakeStep(true, null), 2);
  assert.equal(fileIntakeStep(true, "RUNNING"), 2);
  assert.equal(fileIntakeStep(true, "FAILED"), 2);
  assert.equal(fileIntakeStep(true, "READY"), 3);
  assert.equal(fileIntakeStep(true, "SAVED"), 4);
  assert.equal(fileIntakeStep(true, "DISCARDED"), 2);
});
