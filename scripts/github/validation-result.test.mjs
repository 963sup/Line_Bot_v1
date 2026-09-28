import assert from "node:assert/strict";
import { test } from "node:test";
import { requireValidationSuccess } from "./validation-result.mjs";

test("publication gate accepts only successful validation", () => {
  assert.doesNotThrow(() => requireValidationSuccess("success"));
  for (const result of ["failure", "cancelled", "skipped", "", undefined, "unknown"]) {
    assert.throws(() => requireValidationSuccess(result), /Validation did not succeed/);
  }
});
