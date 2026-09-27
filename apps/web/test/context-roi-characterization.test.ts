import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionCommand } from "@line-work/identity-access/domain/permission";
import type { TeamView } from "@line-work/team/contracts";
import {
  clearPendingPermissionOperation,
  restorePendingPermissionOperation,
  savePendingPermissionOperation,
} from "../src/modules/account/permission-operations";
import {
  mergeRepositoryResourcePage,
  parseRepositoryResourcePage,
  repositoryResourcesEndpoint,
} from "../src/modules/repository/resource-page-model";
import { buildTeamCommand } from "../src/modules/team/team-command";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

test("permission pending operation remains owner-scoped and mismatch clears storage", () => {
  const storage = memoryStorage();
  const command: PermissionCommand = {
    requestId: "request-1",
    target: "user-2",
    permission: "workplaces.manage",
    workplaceId: null,
    enabled: true,
    expectedVersion: 3,
    reason: "characterization",
  };
  const operation = { owner: "user-1", command };

  savePendingPermissionOperation(storage, operation);
  assert.deepEqual(restorePendingPermissionOperation(storage, "user-1"), operation);
  assert.equal(restorePendingPermissionOperation(storage, "user-other"), null);
  assert.equal(storage.getItem("permission-operation"), null);

  savePendingPermissionOperation(storage, operation);
  clearPendingPermissionOperation(storage);
  assert.equal(storage.getItem("permission-operation"), null);
});

test("repository resource endpoint preserves selector and cursor semantics", () => {
  assert.equal(
    repositoryResourcesEndpoint({
      ownerLogin: "octo",
      repositoryName: "repo",
      kind: "discussions",
      milestoneStatus: "open",
      after: "next",
    }),
    "/api/discussions?owner=octo&name=repo&after=next",
  );
  assert.equal(
    repositoryResourcesEndpoint({
      ownerLogin: "octo",
      repositoryName: "repo",
      kind: "discussion",
      discussionId: "discussion/1",
      milestoneStatus: "open",
      after: "comment-next",
    }),
    "/api/discussions/discussion%2F1?owner=octo&name=repo&commentsAfter=comment-next",
  );
  assert.equal(
    repositoryResourcesEndpoint({
      ownerLogin: "octo",
      repositoryName: "repo",
      kind: "milestones",
      milestoneStatus: "closed",
    }),
    "/api/repository-milestones?owner=octo&name=repo&status=closed",
  );
  assert.equal(
    repositoryResourcesEndpoint({
      ownerLogin: "octo",
      repositoryName: "repo",
      kind: "milestone",
      milestoneNumber: 7,
      milestoneStatus: "open",
    }),
    "/api/repository-milestones/7?owner=octo&name=repo",
  );
});

test("repository resource parser rejects malformed responses with the existing 503 shape", () => {
  assert.throws(
    () => parseRepositoryResourcePage("labels", { labels: [] }),
    (error) => {
      assert.deepEqual(error, { status: 503, message: "Repository 資源回應格式不正確。" });
      return true;
    },
  );
});

test("repository resource pagination appends unseen ids and keeps incoming cursor", () => {
  const current = {
    kind: "labels" as const,
    repository: { id: "repo-1", ownerLogin: "octo", name: "repo" },
    labels: [{ id: "label-1", name: "one", color: "111111", description: "", version: 1 }],
    next: "old",
  };
  const incoming = {
    kind: "labels" as const,
    repository: current.repository,
    labels: [
      { id: "label-1", name: "one", color: "111111", description: "", version: 1 },
      { id: "label-2", name: "two", color: "222222", description: "", version: 1 },
    ],
    next: "next",
  };
  const merged = mergeRepositoryResourcePage(current, incoming, true);
  assert.equal(merged.kind, "labels");
  if (merged.kind !== "labels") return;
  assert.deepEqual(
    merged.labels.map((label) => label.id),
    ["label-1", "label-2"],
  );
  assert.equal(merged.next, "next");
});

test("team command construction keeps current scope, stable team id and version", () => {
  const data: TeamView = {
    userId: "user-1",
    organizations: [],
    organizationAccountId: "org-1",
    organizationLogin: "org",
    teams: [],
    team: {
      id: "team-1",
      organizationAccountId: "org-1",
      name: "Core",
      slug: "core",
      version: 7,
      membershipStatus: "active",
      isMaintainer: true,
    },
    members: [],
  };
  const rename = buildTeamCommand(data, { action: "rename-team", name: "Platform" });
  assert.equal(rename.action, "rename-team");
  if (rename.action !== "rename-team") return;
  assert.equal(rename.organizationAccountId, "org-1");
  assert.equal(rename.teamId, "team-1");
  assert.equal(rename.expectedVersion, 7);
  assert.equal(rename.name, "Platform");

  const membership = buildTeamCommand(data, {
    action: "membership",
    targetUserId: "user-2",
    status: "removed",
    title: "remove",
  });
  assert.equal(membership.action, "membership");
  if (membership.action !== "membership") return;
  assert.equal(membership.organizationAccountId, "org-1");
  assert.equal(membership.teamId, "team-1");
  assert.equal(membership.expectedVersion, 7);
  assert.equal(membership.targetUserId, "user-2");
  assert.equal(membership.status, "removed");
});
