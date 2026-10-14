import assert from "node:assert/strict";
import { test } from "node:test";
import { executeWbsCommand } from "../src/application/use-cases/content.js";
import type { WbsReceipt } from "../src/contracts/dto/content.js";
import type { WbsContentTransaction, WbsStore } from "../src/contracts/repositories/content.js";
import type { WbsRevision } from "../src/domain/content.js";
import { WbsError } from "../src/domain/document.js";
import { defaultWbsPolicy } from "../src/domain/governance.js";
import {
  finishWbsProposal,
  proposeWbsScope,
  publishWbsScope,
  reviewWbsScope,
  reviseWbsProposal,
  type WbsReview,
} from "../src/domain/scope-governance.js";

test("scope governance decisions enforce frozen review versions without a database", () => {
  const document = {
    schemaVersion: 1 as const,
    nodes: [
      {
        id: "work",
        parentId: null,
        position: 0,
        kind: "WORK_PACKAGE" as const,
        title: "Launch",
        description: "",
        deliverable: "Ready",
        acceptanceCriteria: "Verified",
      },
    ],
  };
  const proposal = proposeWbsScope(
    { title: "Scope", reason: "", candidateRevisionId: "revision", baseBaselineId: null },
    "proposal",
    1,
    "author",
    1,
  );
  const state = { version: 2, baselineId: null, policy: defaultWbsPolicy };
  const approval = reviewWbsScope(proposal, state.policy, "reviewer", {
    id: "approval",
    decision: "APPROVE",
    note: "",
    at: 2,
    sequence: 2,
  });
  const publish = (reviews: readonly WbsReview[], item = proposal) =>
    publishWbsScope(item, state, document, reviews, "baseline", 3, "publisher", 3);
  assert.deepEqual(publish([approval]).approvalReviewIds, ["approval"]);
  const conflict = (error: unknown) => error instanceof WbsError && error.status === 409;
  assert.throws(() => publish([{ ...approval, policyVersion: 2 }]), conflict);
  assert.throws(() => publish([{ ...approval, candidateRevisionId: "other" }]), conflict);
  assert.throws(() => publish([{ ...approval, eligible: false }]), conflict);
  assert.throws(
    () =>
      publish([approval, { ...approval, id: "changes", sequence: 3, decision: "REQUEST_CHANGES" }]),
    conflict,
  );
  assert.deepEqual(
    publish([{ ...approval, id: "changes", sequence: 1, decision: "REQUEST_CHANGES" }, approval])
      .approvalReviewIds,
    ["approval"],
  );
  const revised = reviseWbsProposal(
    proposal,
    { ...proposal, title: "Changed" },
    "other-proposer",
    3,
  );
  assert.throws(() => publish([approval], revised), conflict);
  const closed = finishWbsProposal(proposal, "CLOSED", "author", 3);
  assert.throws(
    () => reviseWbsProposal(closed, { ...closed, title: "Reopen" }, "author", 4),
    conflict,
  );
  assert.throws(
    () =>
      reviewWbsScope(proposal, { ...state.policy, allowSelfApproval: false }, "author", {
        id: "self",
        decision: "APPROVE",
        note: "",
        at: 2,
        sequence: 2,
      }),
    (error) => error instanceof WbsError && error.status === 403,
  );
});

test("content use case operates through a transaction port and reauthorizes before replay", async () => {
  let current: WbsRevision | null = null;
  let receipt: WbsReceipt | null = null;
  let permissions = ["write"];
  let archived = false;
  const calls: string[] = [];
  const transaction: WbsContentTransaction = {
    get scope() {
      return { repositoryId: "repo", permissions, archived };
    },
    nextId: () => "revision",
    replay: async () => {
      calls.push("replay");
      return receipt;
    },
    load: async () => {
      calls.push("load");
      return current;
    },
    save: async (next) => {
      calls.push("save");
      current = next;
      receipt = { requestId: "request", repositoryId: "repo", revision: next };
      return receipt;
    },
  };
  const store: WbsStore = {
    read: async () => {
      throw new Error("not a read test");
    },
    history: async () => ({ revisions: [], next: null }),
    transact: async (_user, _command, operation) => operation(transaction),
  };
  const command = {
    action: "initialize" as const,
    repositoryId: "repo",
    requestId: "request",
    expectedVersion: 0,
  };
  const saved = await executeWbsCommand(store, "user", command, 1);
  assert.deepEqual(calls, ["replay", "load", "save"]);
  assert.equal(saved.revision.version, 1);
  archived = true;
  calls.length = 0;
  assert.deepEqual(await executeWbsCommand(store, "user", command, 2), saved);
  assert.deepEqual(calls, ["replay"]);
  permissions = ["read"];
  calls.length = 0;
  await assert.rejects(
    executeWbsCommand(store, "user", command, 3),
    (error) => error instanceof WbsError && error.status === 403,
  );
  assert.deepEqual(calls, []);
});
