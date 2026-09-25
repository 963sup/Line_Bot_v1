import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeDiscussionId,
  normalizeIssueNumber,
  normalizeRepositoryMilestoneNumber,
} from "../src/domain.js";

test("Repository owns canonical Issue, Discussion and Milestone locator validation", () => {
  assert.equal(normalizeIssueNumber(1), 1);
  assert.equal(normalizeIssueNumber("1"), 1);
  assert.equal(normalizeIssueNumber(0), null);
  assert.equal(normalizeIssueNumber("not-a-number"), null);

  assert.equal(normalizeDiscussionId("discussion-a"), "discussion-a");
  assert.equal(normalizeDiscussionId(""), null);
  assert.equal(normalizeDiscussionId("x".repeat(121)), null);

  assert.equal(normalizeRepositoryMilestoneNumber(1), 1);
  assert.equal(normalizeRepositoryMilestoneNumber("1"), 1);
  assert.equal(normalizeRepositoryMilestoneNumber("01"), null);
  assert.equal(normalizeRepositoryMilestoneNumber("1e0"), null);
  assert.equal(normalizeRepositoryMilestoneNumber(0), null);
});
