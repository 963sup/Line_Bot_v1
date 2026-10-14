import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { parseWbsGovernanceCommand } from "../src/application/commands/governance.js";
import { executeWbsCommand } from "../src/application/use-cases/content.js";
import { executeWbsGovernanceCommand } from "../src/application/use-cases/governance.js";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "../src/composition/bootstrap/store.js";
import { WbsError, type WbsNode } from "../src/domain/document.js";
import { checkWbsPublication, compareWbsDocuments } from "../src/domain/governance.js";

const packageNode: WbsNode = {
  id: "package",
  parentId: null,
  position: 0,
  kind: "WORK_PACKAGE",
  title: "Open store",
  description: "",
  deliverable: "Store ready",
  acceptanceCriteria: "Inspection passed",
};
test("publication checks and stable-node comparison describe the actual content", () => {
  const old = { schemaVersion: 1 as const, nodes: [packageNode] };
  assert.deepEqual(checkWbsPublication(old), []);
  assert.equal(
    checkWbsPublication({ schemaVersion: 1, nodes: [] })[0]?.code,
    "WORK_PACKAGE_REQUIRED",
  );
  assert.equal(
    checkWbsPublication({ schemaVersion: 1, nodes: [{ ...packageNode, deliverable: " " }] })[0]
      ?.nodeId,
    "package",
  );
  assert.deepEqual(
    compareWbsDocuments(old, { ...old, nodes: [{ ...packageNode, title: "Renamed" }] })[0]?.fields,
    [{ field: "title", before: "Open store", after: "Renamed" }],
  );
  assert.equal(compareWbsDocuments(null, old)[0]?.kind, "ADDED");
  assert.equal(compareWbsDocuments(old, { ...old, nodes: [] })[0]?.kind, "REMOVED");
  assert.throws(
    () =>
      parseWbsGovernanceCommand({
        action: "set-policy",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: 0,
        expectedPolicyVersion: 1,
        minimumApprovals: 0,
        allowSelfApproval: true,
      }),
    WbsError,
  );
});

test("governance preserves frozen review, current authority, publication atomicity and replay", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["owner", "maintainer", "writer", "reader"]) {
    await pg.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO app_private.users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await tx.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
    });
  }
  for (const repo of ["repo", "other"])
    await pg.query(
      "SELECT * FROM app_private.provision_repository($1,'owner','owner','USER',$1,'private')",
      [repo],
    );
  for (const [id, permission] of [
    ["maintainer", "maintain"],
    ["writer", "write"],
    ["reader", "read"],
  ])
    await pg.query(
      "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo',$1,$2,1)",
      [id, permission],
    );
  const content = createPostgresWbsStore(db),
    governance = createPostgresWbsGovernanceStore(db);
  const empty = await governance.view("owner", { repositoryId: "repo" }, {});
  assert.equal(empty.version, 0);
  assert.equal(empty.publishedBaseline, null);
  assert.equal(
    Number(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*) FROM app_private.repository_wbs_governance",
        )
      ).rows[0]?.count,
    ),
    0,
  );
  await executeWbsCommand(
    content,
    "owner",
    { action: "initialize", repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 },
    1,
  );
  await executeWbsCommand(
    content,
    "owner",
    { action: "initialize", repositoryId: "other", requestId: randomUUID(), expectedVersion: 0 },
    1,
  );
  let draft = await executeWbsCommand(
    content,
    "owner",
    {
      action: "create-node",
      node: { ...packageNode, deliverable: "" },
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 1,
    },
    2,
  );
  async function run(input: Record<string, unknown>, user = "owner", store = governance) {
    const state = await governance.view(user, { repositoryId: "repo" }, {});
    return executeWbsGovernanceCommand(
      store,
      user,
      parseWbsGovernanceCommand({
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: state.version,
        ...input,
      }),
      10,
    );
  }
  const conflict = (error: unknown) => error instanceof WbsError && error.status === 409;
  const propose = () =>
    run({
      action: "create-proposal",
      title: "Scope",
      reason: "Ready for review",
      candidateRevisionId: draft.revision.id,
      baseBaselineId: null,
    });
  const a = await propose(),
    b = await propose();
  const aId = a.proposalId,
    bId = b.proposalId;
  assert.ok(aId && bId);
  const review = (
    id: string,
    proposalVersion: number,
    policyVersion: number,
    user = "owner",
    decision = "APPROVE",
  ) =>
    run(
      {
        action: "review-proposal",
        proposalId: id,
        expectedProposalVersion: proposalVersion,
        expectedPolicyVersion: policyVersion,
        decision,
        note: "Checked",
      },
      user,
    );
  const publish = (id: string, proposalVersion: number, policyVersion: number) =>
    run({
      action: "publish-proposal",
      proposalId: id,
      expectedProposalVersion: proposalVersion,
      expectedPolicyVersion: policyVersion,
    });
  await assert.rejects(review(aId, 1, 1, "writer"));
  await assert.rejects(
    run(
      {
        action: "create-proposal",
        title: "Spoof",
        reason: "",
        candidateRevisionId: draft.revision.id,
        baseBaselineId: null,
      },
      "reader",
    ),
  );
  await assert.rejects(
    run({
      action: "create-proposal",
      title: "Wrong scope",
      reason: "",
      candidateRevisionId: (await content.read("owner", { repositoryId: "other" })).revision?.id,
      baseBaselineId: null,
    }),
  );
  await review(aId, 1, 1);
  await assert.rejects(publish(aId, 1, 1), conflict);
  assert.equal(
    (await governance.view("owner", { repositoryId: "repo" }, {})).publishedBaseline,
    null,
  );
  draft = await executeWbsCommand(
    content,
    "owner",
    {
      action: "update-node",
      node: packageNode,
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: draft.revision.version,
    },
    3,
  );
  await run({
    action: "revise-proposal",
    proposalId: aId,
    expectedProposalVersion: 1,
    title: "Scope",
    reason: "Fixed",
    candidateRevisionId: draft.revision.id,
    baseBaselineId: null,
  });
  assert.equal(
    (await governance.view("owner", { repositoryId: "repo" }, { proposalId: aId })).proposal
      ?.approvals,
    0,
  );
  await assert.rejects(review(aId, 1, 1), conflict);
  const historical = await governance.view(
    "owner",
    { repositoryId: "repo" },
    { proposalId: aId, proposalVersion: 1 },
  );
  assert.equal(historical.proposal?.candidate.document.nodes[0]?.deliverable, "");
  assert.equal(historical.proposal?.proposal.reason, "Ready for review");
  assert.equal(historical.proposal?.currentVersion, 2);
  await review(aId, 2, 1);
  await run({
    action: "set-policy",
    expectedPolicyVersion: 1,
    minimumApprovals: 2,
    allowSelfApproval: true,
  });
  await assert.rejects(publish(aId, 2, 1), conflict);
  await assert.rejects(publish(aId, 2, 2), conflict);
  await review(aId, 2, 2);
  await review(aId, 2, 2);
  for (let i = 0; i < 21; i++) await review(aId, 2, 2);
  const reviewPage = await governance.view("owner", { repositoryId: "repo" }, { proposalId: aId });
  assert.equal(reviewPage.proposal?.reviews.length, 20);
  assert.ok(reviewPage.proposal?.nextReview);
  const olderReviews = await governance.view(
    "owner",
    { repositoryId: "repo" },
    { proposalId: aId, beforeReview: reviewPage.proposal.nextReview },
  );
  assert.ok(olderReviews.proposal?.reviews.some((review) => review.proposalVersion === 1));
  assert.equal(
    (await governance.view("owner", { repositoryId: "repo" }, { proposalId: aId })).proposal
      ?.approvals,
    1,
  );
  await review(aId, 2, 2, "maintainer", "REQUEST_CHANGES");
  await assert.rejects(publish(aId, 2, 2), conflict);
  await review(aId, 2, 2, "maintainer");
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='maintainer'",
  );
  await assert.rejects(publish(aId, 2, 2), conflict);
  assert.equal(
    (
      await governance.view("owner", { repositoryId: "repo" }, { proposalId: aId })
    ).proposal?.reviews.find((r) => r.reviewerUserId === "maintainer")?.eligible,
    false,
  );
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','maintainer','maintain',2)",
  );
  const frozen = draft.revision;
  draft = await executeWbsCommand(
    content,
    "owner",
    {
      action: "update-node",
      node: { ...packageNode, title: "Later draft" },
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: draft.revision.version,
    },
    4,
  );
  const beforeFailure = await governance.view("owner", { repositoryId: "repo" }, {});
  const failing: Database = {
    transaction: (work) =>
      db.transaction((sql) =>
        work(
          createSql(async (text, values) => {
            if (text.startsWith("INSERT INTO repository_wbs_governance_commands"))
              throw new Error("simulated receipt failure");
            return sql.query(text, values);
          }),
        ),
      ),
  };
  await assert.rejects(
    run(
      {
        action: "publish-proposal",
        proposalId: aId,
        expectedProposalVersion: 2,
        expectedPolicyVersion: 2,
      },
      "owner",
      createPostgresWbsGovernanceStore(failing),
    ),
    /simulated receipt failure/,
  );
  assert.equal(
    (await governance.view("owner", { repositoryId: "repo" }, {})).version,
    beforeFailure.version,
  );
  assert.equal(
    Number(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*) FROM app_private.repository_wbs_baselines",
        )
      ).rows[0]?.count,
    ),
    0,
  );
  const publishCommand = parseWbsGovernanceCommand({
    action: "publish-proposal",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: beforeFailure.version,
    proposalId: aId,
    expectedProposalVersion: 2,
    expectedPolicyVersion: 2,
  });
  const published = await executeWbsGovernanceCommand(governance, "owner", publishCommand, 20);
  assert.deepEqual(
    await executeWbsGovernanceCommand(governance, "owner", publishCommand, 99),
    published,
  );
  const official = await governance.view("owner", { repositoryId: "repo" }, { proposalId: aId });
  assert.equal(official.baseline?.revision.id, frozen.id);
  assert.equal(official.baseline?.baseline.approvalReviewIds.length, 2);
  assert.equal(
    official.proposal?.reviews.filter((review) =>
      official.baseline?.baseline.approvalReviewIds.includes(review.id),
    ).length,
    2,
  );
  assert.equal(official.proposal?.approvals, 2);
  assert.equal(
    (await content.read("owner", { repositoryId: "repo" })).revision?.id,
    draft.revision.id,
  );
  await assert.rejects(publish(bId, 1, 2), conflict);
  await assert.rejects(
    executeWbsGovernanceCommand(governance, "owner", { ...publishCommand, expectedVersion: 0 }, 21),
    conflict,
  );
  await assert.rejects(
    executeWbsCommand(
      content,
      "owner",
      {
        action: "update-node",
        node: packageNode,
        repositoryId: "repo",
        requestId: publishCommand.requestId,
        expectedVersion: draft.revision.version,
      },
      21,
    ),
    conflict,
  );
  await assert.rejects(
    db.transaction((sql) => sql.query("UPDATE repository_wbs_baselines SET at=1")),
    /permission denied/,
  );
  await assert.rejects(
    db.transaction((sql) => sql.query("DELETE FROM repository_wbs_reviews")),
    /permission denied/,
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE repository_wbs_proposal_versions SET reason='rewrite'"),
    ),
    /permission denied/,
  );
  await assert.rejects(governance.view("owner", { repositoryId: "other" }, { proposalId: aId }));
  await assert.rejects(
    governance.view("owner", { repositoryId: "other" }, { baselineId: published.baselineId ?? "" }),
  );
  await run({
    action: "set-policy",
    expectedPolicyVersion: 2,
    minimumApprovals: 1,
    allowSelfApproval: false,
  });
  const c = await run({
    action: "create-proposal",
    title: "Next scope",
    reason: "",
    candidateRevisionId: draft.revision.id,
    baseBaselineId: published.baselineId,
  });
  const historicalPublication = await governance.view(
    "owner",
    { repositoryId: "repo" },
    { proposalId: aId, proposalVersion: 2 },
  );
  assert.equal(historicalPublication.policy.version, 3);
  assert.equal(historicalPublication.proposal?.proposal.status, "OPEN");
  assert.equal(historicalPublication.proposal?.publication?.policy.version, 2);
  assert.equal(historicalPublication.proposal?.approvals, 2);
  const unpublishedVersion = await governance.view(
    "owner",
    { repositoryId: "repo" },
    { proposalId: aId, proposalVersion: 1 },
  );
  assert.equal(unpublishedVersion.proposal?.publication, null);
  assert.ok(c.proposalId);
  await assert.rejects(review(c.proposalId, 1, 3));
  await review(c.proposalId, 1, 3, "maintainer");
  await run(
    {
      action: "revise-proposal",
      proposalId: c.proposalId,
      expectedProposalVersion: 1,
      title: "Maintainer edit",
      reason: "Changed by reviewer",
      candidateRevisionId: draft.revision.id,
      baseBaselineId: published.baselineId,
    },
    "maintainer",
  );
  await assert.rejects(review(c.proposalId, 2, 3, "maintainer"));
  await assert.rejects(review(c.proposalId, 2, 3, "owner"));
  await run({ action: "close-proposal", proposalId: c.proposalId, expectedProposalVersion: 2 });
  await assert.rejects(publish(c.proposalId, 3, 3), conflict);
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.deepEqual(
    await executeWbsGovernanceCommand(governance, "owner", publishCommand, 100),
    published,
  );
  await assert.rejects(
    run({
      action: "set-policy",
      expectedPolicyVersion: 3,
      minimumApprovals: 1,
      allowSelfApproval: true,
    }),
    conflict,
  );
  assert.equal((await governance.view("reader", { repositoryId: "repo" }, {})).canReview, false);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='reader'",
  );
  await assert.rejects(governance.view("reader", { repositoryId: "repo" }, {}));
  await pg.query("UPDATE app_private.repository_wbs_revisions SET document=$2 WHERE id=$1", [
    frozen.id,
    { schemaVersion: 1, nodes: [{}] },
  ]);
  await assert.rejects(
    governance.view("owner", { repositoryId: "repo" }, {}),
    (error) => error instanceof WbsError && error.status === 503,
  );
});
