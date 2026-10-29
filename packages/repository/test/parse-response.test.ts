import assert from "node:assert/strict";
import test from "node:test";
import { isAccessCommand, isAccessSnapshot } from "../src/contracts/parse-access-response.js";
import { isRepositorySummary } from "../src/contracts/parse-collection-response.js";
import { isLabelsResult } from "../src/contracts/parse-resource-response.js";

const repository = { id: "repository-1", ownerLogin: "owner", name: "repo", permissions: ["read"] };

test("Repository response contract retains all six distinct permissions and rejects unknown values", () => {
  for (const permission of ["read", "triage", "triage_plus", "write", "maintain", "admin"]) {
    assert.equal(isRepositorySummary({ ...repository, permissions: [permission] }), true);
  }
  assert.equal(isRepositorySummary({ ...repository, permissions: ["owner"] }), false);
  assert.equal(isRepositorySummary({ ...repository, permissions: ["read", null] }), false);
  assert.equal(isRepositorySummary({ ...repository, ownerLogin: 1 }), false);
});

test("Repository resource codec fails closed on corrupt nested rows and pagination", () => {
  const label = {
    id: "label-1",
    repositoryId: repository.id,
    name: "label",
    color: "ffffff",
    description: "",
    version: 1,
  };
  assert.equal(isLabelsResult({ repository, labels: [label], next: null }), true);
  assert.equal(
    isLabelsResult({ repository, labels: [{ ...label, version: "1" }], next: null }),
    false,
  );
  assert.equal(isLabelsResult({ repository, labels: [label], next: 2 }), false);
});

test("Repository access codec preserves grant versus revoke payload and nested grant validation", () => {
  const command = {
    requestId: "request-1",
    repositoryId: repository.id,
    subjectId: "user-1",
    subjectKind: "USER",
    expectedVersion: 0,
  };
  assert.equal(isAccessCommand({ ...command, action: "revoke" }), true);
  assert.equal(isAccessCommand({ ...command, action: "grant" }), false);
  assert.equal(isAccessCommand({ ...command, action: "grant", capability: "triage_plus" }), true);
  const snapshot = {
    repository: { ...repository, ownerKind: "USER", actorPermissions: ["admin"] },
    directUserGrants: [],
    teamGrants: [],
  };
  assert.equal(isAccessSnapshot(snapshot), true);
  assert.equal(
    isAccessSnapshot({
      ...snapshot,
      teamGrants: [{ teamId: "team-1", capability: "owner", version: 1 }],
    }),
    false,
  );
});
