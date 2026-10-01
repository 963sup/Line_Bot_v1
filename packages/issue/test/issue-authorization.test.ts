import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepositoryPermission } from "@line_bot_v1/repository/domain";
import { canManageIssueWork } from "../src/domain.js";

const managementPermissions = [
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
] as const satisfies readonly RepositoryPermission[];

test("assigned-work commands use explicit Repository Issue management permissions", () => {
  assert.equal(canManageIssueWork(["read"]), false);
  for (const permission of managementPermissions) {
    assert.equal(canManageIssueWork([permission]), true);
  }
});

test("assigned-work authorization combines independent effective permission facts", () => {
  assert.equal(canManageIssueWork([]), false);
  assert.equal(canManageIssueWork(["read", "triage"]), true);
});
