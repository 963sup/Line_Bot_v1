import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createWbs } from "../src/application/use-cases/content.js";
import { createWbsGovernance } from "../src/application/use-cases/governance.js";
import { createPostgresWbsMetrics } from "../src/composition/bootstrap/metrics.js";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "../src/composition/bootstrap/store.js";

test("WBS metrics distinguish absent content and absent approved Baseline", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Metrics','private')",
  );
  const query = createPostgresWbsMetrics(db);
  assert.deepEqual(await query.read("owner", "repo"), {
    initialized: false,
    pendingProposals: 0,
    baseline: null,
    draftRevisionId: null,
    differences: null,
  });
  const wbs = createWbs({
    activeUser: async () => ({ id: "owner" }),
    store: () => createPostgresWbsStore(db),
    now: () => 1,
  });
  const saved = await wbs.execute("subject", {
    action: "initialize",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
  });
  const view = await query.read("owner", "repo");
  assert.equal(view.initialized, true);
  assert.equal(view.draftRevisionId, saved.revision.id);
  assert.equal(view.baseline, null);
  assert.equal(view.differences, null);
  const node = {
    id: "work",
    parentId: null,
    position: 0,
    kind: "WORK_PACKAGE",
    title: "Work",
    description: "",
    deliverable: "Result",
    acceptanceCriteria: "Checked",
  };
  const draft = await wbs.execute("subject", {
    action: "create-node",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 1,
    node,
  });
  const governance = createWbsGovernance({
    activeUser: async () => ({ id: "owner" }),
    store: () => createPostgresWbsGovernanceStore(db),
    now: () => 2,
  });
  const proposal = await governance.execute("subject", {
    action: "create-proposal",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Scope",
    reason: "",
    candidateRevisionId: draft.revision.id,
    baseBaselineId: null,
  });
  assert.equal((await query.read("owner", "repo")).pendingProposals, 1);
  await governance.execute("subject", {
    action: "review-proposal",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: proposal.version,
    proposalId: proposal.proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
    decision: "APPROVE",
    note: "",
  });
  const published = await governance.execute("subject", {
    action: "publish-proposal",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 2,
    proposalId: proposal.proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
  });
  const approved = await query.read("owner", "repo");
  assert.equal(approved.pendingProposals, 0);
  assert.equal(approved.baseline?.id, published.baselineId);
  assert.deepEqual(approved.differences, []);
  await wbs.execute("subject", {
    action: "update-node",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 2,
    node: { ...node, title: "Changed" },
  });
  assert.equal((await query.read("owner", "repo")).differences?.[0]?.kind, "CHANGED");
  await assert.rejects(query.read("unknown", "repo"));
});
