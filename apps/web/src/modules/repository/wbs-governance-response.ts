import { isRecord, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  WbsBaseline,
  WbsGovernanceReceipt,
  WbsGovernanceView,
  WbsProposal,
  WbsReview,
} from "@line_bot_v1/wbs/contracts/governance";
import {
  checkWbsPublication,
  compareWbsDocuments,
  type WbsPolicy,
} from "@line_bot_v1/wbs/domain/governance";
import { wbsRevision } from "./wbs-response";

function object(value: unknown) {
  if (!isRecord(value)) throw new Error("WBS 治理回應格式不正確。");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("WBS 治理清單格式不正確。");
  return value;
}
function flag(value: unknown) {
  if (typeof value !== "boolean") throw new Error("WBS 治理權限格式不正確。");
  return value;
}
function nullable(value: unknown) {
  return value === null ? null : stringValue(value);
}
function policy(value: unknown): WbsPolicy {
  const v = object(value);
  return {
    version: numberValue(v.version),
    minimumApprovals: numberValue(v.minimumApprovals),
    allowSelfApproval: flag(v.allowSelfApproval),
  };
}
function proposal(value: unknown): WbsProposal {
  const v = object(value),
    status = v.status;
  if (status !== "OPEN" && status !== "CLOSED" && status !== "PUBLISHED")
    throw new Error("提案狀態不正確。");
  return {
    id: stringValue(v.id),
    number: numberValue(v.number),
    title: stringValue(v.title),
    reason: stringValue(v.reason),
    status,
    version: numberValue(v.version),
    candidateRevisionId: stringValue(v.candidateRevisionId),
    baseBaselineId: nullable(v.baseBaselineId),
    authorUserId: stringValue(v.authorUserId),
    proposerUserId: stringValue(v.proposerUserId),
    createdAt: numberValue(v.createdAt),
    updatedAt: numberValue(v.updatedAt),
  };
}
function baseline(value: unknown): WbsBaseline {
  const v = object(value);
  return {
    id: stringValue(v.id),
    number: numberValue(v.number),
    proposalId: stringValue(v.proposalId),
    proposalVersion: numberValue(v.proposalVersion),
    revisionId: stringValue(v.revisionId),
    previousBaselineId: nullable(v.previousBaselineId),
    policy: policy(v.policy),
    approvalReviewIds: list(v.approvalReviewIds).map(stringValue),
    publishedBy: stringValue(v.publishedBy),
    at: numberValue(v.at),
  };
}
function review(value: unknown): WbsReview {
  const v = object(value),
    decision = v.decision;
  if (decision !== "APPROVE" && decision !== "REQUEST_CHANGES") throw new Error("審查結果不正確。");
  return {
    id: stringValue(v.id),
    proposalVersion: numberValue(v.proposalVersion),
    candidateRevisionId: stringValue(v.candidateRevisionId),
    policyVersion: numberValue(v.policyVersion),
    reviewerUserId: stringValue(v.reviewerUserId),
    decision,
    note: stringValue(v.note),
    at: numberValue(v.at),
    eligible: flag(v.eligible),
    sequence: numberValue(v.sequence),
  };
}
export function wbsGovernanceView(value: unknown): WbsGovernanceView {
  const v = object(value),
    repo = object(v.repository);
  let detail: WbsGovernanceView["proposal"] = null;
  if (v.proposal !== null) {
    const d = object(v.proposal),
      candidate = wbsRevision(d.candidate),
      base = d.base === null ? null : wbsRevision(d.base);
    detail = {
      proposal: proposal(d.proposal),
      currentVersion: numberValue(d.currentVersion),
      candidate,
      base,
      differences: compareWbsDocuments(base?.document ?? null, candidate.document),
      failures: checkWbsPublication(candidate.document),
      reviews: list(d.reviews).map(review),
      nextReview: d.nextReview === null ? null : numberValue(d.nextReview),
      approvals: numberValue(d.approvals),
      blocked: flag(d.blocked),
      baseIsCurrent: flag(d.baseIsCurrent),
    };
  }
  const selected = v.baseline === null ? null : object(v.baseline);
  return {
    repository: {
      id: stringValue(repo.id),
      ownerLogin: stringValue(repo.ownerLogin),
      name: stringValue(repo.name),
    },
    actorUserId: stringValue(v.actorUserId),
    archived: flag(v.archived),
    canPropose: flag(v.canPropose),
    canReview: flag(v.canReview),
    canSetPolicy: flag(v.canSetPolicy),
    version: numberValue(v.version),
    policy: policy(v.policy),
    draftRevisionId: nullable(v.draftRevisionId),
    publishedBaseline: v.publishedBaseline === null ? null : baseline(v.publishedBaseline),
    proposals: list(v.proposals).map(proposal),
    nextProposal: v.nextProposal === null ? null : numberValue(v.nextProposal),
    baselines: list(v.baselines).map(baseline),
    nextBaseline: v.nextBaseline === null ? null : numberValue(v.nextBaseline),
    baseline: selected
      ? { baseline: baseline(selected.baseline), revision: wbsRevision(selected.revision) }
      : null,
    proposal: detail,
  };
}
export function wbsGovernanceReceipt(value: unknown): WbsGovernanceReceipt {
  const v = object(value),
    action = v.action;
  if (
    action !== "create-proposal" &&
    action !== "revise-proposal" &&
    action !== "close-proposal" &&
    action !== "review-proposal" &&
    action !== "publish-proposal" &&
    action !== "set-policy"
  )
    throw new Error("治理回執操作不正確。");
  return {
    requestId: stringValue(v.requestId),
    repositoryId: stringValue(v.repositoryId),
    action,
    version: numberValue(v.version),
    proposalId: nullable(v.proposalId),
    baselineId: nullable(v.baselineId),
  };
}
