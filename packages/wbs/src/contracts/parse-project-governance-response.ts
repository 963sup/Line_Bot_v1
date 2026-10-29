import { numberValue, stringValue } from "@line_bot_v1/platform/validation";
import { checkWbsPublication, compareWbsDocuments } from "../domain/governance.js";
import type {
  ProjectWbsGovernanceReceipt,
  ProjectWbsGovernanceView,
} from "./dto/project-governance.js";
import {
  baseline,
  flag,
  list,
  nullable,
  object,
  policy,
  proposal,
  review,
} from "./governance-response-values.js";
import { wbsRevision } from "./parse-project-content-response.js";

export function projectWbsGovernanceView(value: unknown): ProjectWbsGovernanceView {
  const v = object(value),
    project = object(v.project);
  let detail: ProjectWbsGovernanceView["proposal"] = null;
  if (v.proposal !== null) {
    const d = object(v.proposal),
      candidate = wbsRevision(d.candidate),
      base = d.base === null ? null : wbsRevision(d.base);
    detail = {
      proposal: proposal(d.proposal),
      currentVersion: numberValue(d.currentVersion),
      publication: d.publication === null ? null : baseline(d.publication),
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
    project: {
      id: stringValue(project.id),
      title: stringValue(project.title),
    },
    actorUserId: stringValue(v.actorUserId),
    closed: flag(v.closed),
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
export function projectWbsGovernanceReceipt(value: unknown): ProjectWbsGovernanceReceipt {
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
    projectId: stringValue(v.projectId),
    action,
    version: numberValue(v.version),
    proposalId: nullable(v.proposalId),
    baselineId: nullable(v.baselineId),
  };
}
