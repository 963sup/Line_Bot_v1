import assert from "node:assert/strict";
import { test } from "node:test";
import {
  wbsHistory,
  wbsReceipt,
  wbsRevision,
  wbsView,
} from "../src/contracts/parse-content-response.js";

const revision = {
  id: "revision-1",
  version: 1,
  parentRevisionId: null,
  actorUserId: "writer",
  action: "initialize",
  at: 100,
  document: { schemaVersion: 1, nodes: [] },
};

test("repository WBS response parsing preserves existing revision, receipt, view and history", () => {
  assert.equal(wbsRevision(revision).action, "initialize");
  assert.equal(
    wbsReceipt({ requestId: "request", repositoryId: "repo", revision }).revision.version,
    1,
  );
  const view = wbsView({
    repository: { id: "repo", ownerLogin: "owner", name: "name" },
    actorUserId: "writer",
    canEdit: true,
    canManageRepository: false,
    archived: false,
    version: 1,
    revision,
  });
  assert.equal(view.revision?.id, "revision-1");
  assert.equal(wbsHistory({ revisions: [revision], next: null }).revisions.length, 1);
});

test("repository WBS response parsing preserves rejection of invalid input", () => {
  assert.throws(() => wbsRevision({ ...revision, action: "unknown" }));
  assert.throws(() => wbsReceipt({ requestId: "request", repositoryId: "repo" }));
  assert.throws(() => wbsView({ repository: null }));
  assert.throws(() => wbsHistory({ revisions: "invalid", next: null }));
});
