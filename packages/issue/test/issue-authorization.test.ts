import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepositoryPermission } from "@line_bot_v1/repository/domain";
import {
  canCommentOnIssue,
  canManageIssueWork,
  canOpenIssue,
  canReadIssueScope,
  canUseIssueOperation,
  type IssueRepositoryOperation,
} from "../src/domain.js";

const allPermissions = [
  "read",
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
] as const satisfies readonly RepositoryPermission[];

const managementPermissions = [
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
] as const satisfies readonly RepositoryPermission[];

test("RepositoryPermission maps to explicit Issue operations without a synthetic rank", () => {
  for (const permission of allPermissions) {
    for (const operation of ["read", "open", "comment"] as const) {
      assert.equal(canUseIssueOperation([permission], operation), true);
    }
  }

  for (const operation of ["triage", "edit", "close", "assign"] as const) {
    assert.equal(canUseIssueOperation(["read"], operation), false);
    for (const permission of managementPermissions) {
      assert.equal(canUseIssueOperation([permission], operation), true);
    }
  }

  for (const permission of allPermissions) {
    assert.equal(canUseIssueOperation([permission], "manage-resource"), false);
  }
});

test("public visibility and creation policy are independent from RepositoryPermission", () => {
  assert.equal(canReadIssueScope({ repositoryPublic: false, permissions: [] }), false);
  assert.equal(canReadIssueScope({ repositoryPublic: true, permissions: [] }), true);
  assert.equal(canReadIssueScope({ repositoryPublic: false, permissions: ["read"] }), true);

  assert.equal(
    canOpenIssue({
      repositoryPublic: true,
      permissions: [],
      actorQualified: true,
      actorIsCollaborator: false,
      creationPolicy: "all",
    }),
    true,
  );
  assert.equal(
    canOpenIssue({
      repositoryPublic: true,
      permissions: [],
      actorQualified: true,
      actorIsCollaborator: false,
      creationPolicy: "collaborators_only",
    }),
    false,
  );
  assert.equal(
    canOpenIssue({
      repositoryPublic: false,
      permissions: ["read"],
      actorQualified: true,
      actorIsCollaborator: true,
      creationPolicy: "collaborators_only",
    }),
    true,
  );
  assert.equal(
    canOpenIssue({
      repositoryPublic: true,
      permissions: ["read"],
      actorQualified: false,
      actorIsCollaborator: true,
      creationPolicy: "all",
    }),
    false,
  );
});

test("comments check actor qualification and conversation lock separately", () => {
  const allowed = {
    repositoryPublic: false,
    permissions: ["read"] as const,
    actorQualified: true,
    conversationLocked: false,
  };
  assert.equal(canCommentOnIssue(allowed), true);
  assert.equal(canCommentOnIssue({ ...allowed, actorQualified: false }), false);
  assert.equal(canCommentOnIssue({ ...allowed, conversationLocked: true }), false);
  assert.equal(
    canCommentOnIssue({
      repositoryPublic: true,
      permissions: [],
      actorQualified: true,
      conversationLocked: false,
    }),
    false,
  );
});

test("assigned-work commands remain a stricter composite management operation", () => {
  assert.equal(canManageIssueWork([]), false);
  assert.equal(canManageIssueWork(["read"]), false);
  assert.equal(canManageIssueWork(["read", "triage"]), true);
  for (const permission of managementPermissions) {
    assert.equal(canManageIssueWork([permission]), true);
  }
});

test("operation vocabulary stays explicit", () => {
  const operations: readonly IssueRepositoryOperation[] = [
    "read",
    "open",
    "comment",
    "triage",
    "edit",
    "close",
    "assign",
    "manage-resource",
  ];
  assert.equal(operations.length, 8);
});
