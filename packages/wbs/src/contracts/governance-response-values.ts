import { isRecord, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { WbsPolicy } from "../domain/governance.js";
import type { WbsBaseline, WbsProposal, WbsReview } from "../domain/scope-governance.js";

export function object(value: unknown) {
  if (!isRecord(value)) throw new Error("WBS 治理回應格式不正確。");
  return value;
}
export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("WBS 治理清單格式不正確。");
  return value;
}
export function flag(value: unknown) {
  if (typeof value !== "boolean") throw new Error("WBS 治理權限格式不正確。");
  return value;
}
export function nullable(value: unknown) {
  return value === null ? null : stringValue(value);
}
export function policy(value: unknown): WbsPolicy {
  const v = object(value);
  return {
    version: numberValue(v.version),
    minimumApprovals: numberValue(v.minimumApprovals),
    allowSelfApproval: flag(v.allowSelfApproval),
  };
}
export function proposal(value: unknown): WbsProposal {
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
export function baseline(value: unknown): WbsBaseline {
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
export function review(value: unknown): WbsReview {
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
