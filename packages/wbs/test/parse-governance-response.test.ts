import assert from "node:assert/strict";
import { test } from "node:test";
import { wbsRevision as repositoryRevision } from "../src/contracts/parse-content-response.js";
import {
  wbsGovernanceReceipt,
  wbsGovernanceView,
} from "../src/contracts/parse-governance-response.js";
import { wbsRevision as projectRevision } from "../src/contracts/parse-project-content-response.js";
import {
  projectWbsGovernanceReceipt,
  projectWbsGovernanceView,
} from "../src/contracts/parse-project-governance-response.js";

const scope = {
  actorUserId: "actor",
  canPropose: true,
  canReview: false,
  canSetPolicy: false,
  version: 3,
  policy: { version: 1, minimumApprovals: 2, allowSelfApproval: false },
  draftRevisionId: "revision",
  publishedBaseline: null,
  proposals: [],
  nextProposal: null,
  baselines: [],
  nextBaseline: null,
  baseline: null,
  proposal: null,
};

test("governance codecs preserve scope and permission projections without substituting another scope", () => {
  const repository = {
    ...scope,
    repository: { id: "repo", ownerLogin: "owner", name: "repo" },
    archived: true,
  };
  const project = { ...scope, project: { id: "project", title: "Project" }, closed: true };
  assert.deepEqual(wbsGovernanceView(repository), repository);
  assert.deepEqual(projectWbsGovernanceView(project), project);
  assert.throws(() => wbsGovernanceView(project));
  assert.throws(() => projectWbsGovernanceView(repository));
  assert.throws(() => wbsGovernanceView({ ...repository, canReview: "true" }));
  const receipt = {
    requestId: "request",
    action: "publish-proposal",
    version: 3,
    proposalId: "proposal",
    baselineId: "baseline",
  };
  assert.deepEqual(wbsGovernanceReceipt({ ...receipt, repositoryId: "repo" }), {
    ...receipt,
    repositoryId: "repo",
  });
  assert.deepEqual(projectWbsGovernanceReceipt({ ...receipt, projectId: "project" }), {
    ...receipt,
    projectId: "project",
  });
  assert.throws(() =>
    projectWbsGovernanceReceipt({ ...receipt, projectId: "project", action: "activate-transfer" }),
  );
});

test("project content codec preserves import evidence while repository predecessor retains its action contract", () => {
  const revision = {
    id: "revision",
    version: 2,
    parentRevisionId: "previous",
    actorUserId: "actor",
    at: 100,
    action: "import-content-document",
    document: { schemaVersion: 1, nodes: [] },
    contentImport: {
      repositoryId: "repo",
      contentRevisionId: "content-revision",
      contentVersion: 1,
      mappingVersion: "content-wbs-v1",
      nodeCoverage: [],
      sourceRows: [],
    },
  };
  assert.deepEqual(projectRevision(revision), revision);
  assert.throws(() => repositoryRevision(revision));
  assert.throws(() =>
    projectRevision({
      ...revision,
      contentImport: { ...revision.contentImport, mappingVersion: "unknown" },
    }),
  );
});
