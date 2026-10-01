import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeIssueNumber } from "../src/domain.js";

test("Issue owns canonical repository-scoped Issue number validation", () => {
  assert.equal(normalizeIssueNumber(1), 1);
  assert.equal(normalizeIssueNumber("1"), 1);
  assert.equal(normalizeIssueNumber(0), null);
  assert.equal(normalizeIssueNumber("not-a-number"), null);
});
