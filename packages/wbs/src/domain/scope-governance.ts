import { type WbsDocument, WbsError } from "./document.js";
import { checkWbsPublication, compareWbsDocuments, type WbsPolicy } from "./governance.js";

export type WbsProposal = Readonly<{
  id: string;
  number: number;
  title: string;
  reason: string;
  status: "OPEN" | "CLOSED" | "PUBLISHED";
  version: number;
  candidateRevisionId: string;
  baseBaselineId: string | null;
  authorUserId: string;
  proposerUserId: string;
  createdAt: number;
  updatedAt: number;
}>;
export type WbsReview = Readonly<{
  id: string;
  proposalVersion: number;
  candidateRevisionId: string;
  policyVersion: number;
  reviewerUserId: string;
  decision: "APPROVE" | "REQUEST_CHANGES";
  note: string;
  at: number;
  eligible: boolean;
  sequence: number;
}>;
export type WbsBaseline = Readonly<{
  id: string;
  number: number;
  proposalId: string;
  proposalVersion: number;
  revisionId: string;
  previousBaselineId: string | null;
  policy: WbsPolicy;
  approvalReviewIds: readonly string[];
  publishedBy: string;
  at: number;
}>;

export type WbsGovernanceState = Readonly<{
  version: number;
  baselineId: string | null;
  policy: WbsPolicy;
}>;
export type WbsProposalContent = Pick<
  WbsProposal,
  "title" | "reason" | "candidateRevisionId" | "baseBaselineId"
>;

export function nextGovernanceVersion(
  state: WbsGovernanceState,
  expectedVersion: number,
  expectedPolicyVersion?: number,
) {
  if (state.version !== expectedVersion) throw new WbsError(409, "治理資料已更新，請重新確認。");
  if (expectedPolicyVersion !== undefined && expectedPolicyVersion !== state.policy.version)
    throw new WbsError(409, "治理政策已更新，請重新審查。");
  return state.version + 1;
}

export function changeWbsPolicy(
  current: WbsPolicy,
  minimumApprovals: number,
  allowSelfApproval: boolean,
): WbsPolicy {
  if (!Number.isSafeInteger(minimumApprovals) || minimumApprovals < 1 || minimumApprovals > 10)
    throw new WbsError(400, "審查政策不正確。");
  if (
    minimumApprovals === current.minimumApprovals &&
    allowSelfApproval === current.allowSelfApproval
  )
    throw new WbsError(409, "政策沒有變更。");
  return { version: current.version + 1, minimumApprovals, allowSelfApproval };
}

export function assertOpenWbsProposal(item: WbsProposal, expectedVersion: number) {
  if (item.version !== expectedVersion || item.status !== "OPEN")
    throw new WbsError(409, "提案已更新或已結束。");
}

export function assertWbsCandidate(
  baseBaselineId: string | null,
  currentBaselineId: string | null,
  candidate: WbsDocument,
  previous: WbsDocument | null,
) {
  if (baseBaselineId !== currentBaselineId)
    throw new WbsError(409, "正式基底已更新，請重新確認差異。");
  if (previous && !compareWbsDocuments(previous, candidate).length)
    throw new WbsError(409, "候選版本與正式範圍沒有差異。");
}

export function proposeWbsScope(
  content: WbsProposalContent,
  id: string,
  number: number,
  actor: string,
  at: number,
): WbsProposal {
  return {
    ...content,
    id,
    number,
    version: 1,
    status: "OPEN",
    authorUserId: actor,
    proposerUserId: actor,
    createdAt: at,
    updatedAt: at,
  };
}

export function reviseWbsProposal(
  item: WbsProposal,
  content: WbsProposalContent,
  actor: string,
  at: number,
): WbsProposal {
  assertOpenWbsProposal(item, item.version);
  if (
    item.candidateRevisionId === content.candidateRevisionId &&
    item.baseBaselineId === content.baseBaselineId &&
    item.title === content.title &&
    item.reason === content.reason
  )
    throw new WbsError(409, "提案沒有變更。");
  return { ...item, ...content, version: item.version + 1, proposerUserId: actor, updatedAt: at };
}

export function finishWbsProposal(
  item: WbsProposal,
  status: "CLOSED" | "PUBLISHED",
  actor: string,
  at: number,
): WbsProposal {
  assertOpenWbsProposal(item, item.version);
  return { ...item, status, version: item.version + 1, proposerUserId: actor, updatedAt: at };
}

export function isWbsReviewerEligible(
  item: WbsProposal,
  policy: WbsPolicy,
  reviewer: string,
  qualified: boolean,
) {
  return (
    qualified &&
    (policy.allowSelfApproval ||
      (reviewer !== item.authorUserId && reviewer !== item.proposerUserId))
  );
}

export function reviewWbsScope(
  item: WbsProposal,
  policy: WbsPolicy,
  reviewer: string,
  input: Pick<WbsReview, "id" | "decision" | "note" | "at" | "sequence">,
): WbsReview {
  assertOpenWbsProposal(item, item.version);
  if (!isWbsReviewerEligible(item, policy, reviewer, true))
    throw new WbsError(403, "目前政策不允許自我審查。");
  return {
    ...input,
    proposalVersion: item.version,
    candidateRevisionId: item.candidateRevisionId,
    policyVersion: policy.version,
    reviewerUserId: reviewer,
    eligible: true,
  };
}

export function summarizeWbsReviews(
  item: WbsProposal,
  policy: WbsPolicy,
  reviews: readonly WbsReview[],
) {
  const latest = new Map<string, WbsReview>();
  for (const review of reviews) {
    if (
      review.proposalVersion !== item.version ||
      review.candidateRevisionId !== item.candidateRevisionId ||
      review.policyVersion !== policy.version
    )
      continue;
    const previous = latest.get(review.reviewerUserId);
    if (!previous || review.sequence > previous.sequence) latest.set(review.reviewerUserId, review);
  }
  const eligible = [...latest.values()].filter((review) =>
    isWbsReviewerEligible(item, policy, review.reviewerUserId, review.eligible),
  );
  return {
    approvalReviewIds: eligible
      .filter((review) => review.decision === "APPROVE")
      .map((review) => review.id),
    blocked: eligible.some((review) => review.decision === "REQUEST_CHANGES"),
  };
}

export function publishWbsScope(
  item: WbsProposal,
  state: WbsGovernanceState,
  candidate: WbsDocument,
  reviews: readonly WbsReview[],
  id: string,
  number: number,
  actor: string,
  at: number,
): WbsBaseline {
  assertOpenWbsProposal(item, item.version);
  if (item.baseBaselineId !== state.baselineId)
    throw new WbsError(409, "正式基底已更新，請更新提案並重新審查。");
  const failures = checkWbsPublication(candidate);
  if (failures.length) throw new WbsError(409, failures[0]?.message ?? "必要檢查未通過。");
  const summary = summarizeWbsReviews(item, state.policy, reviews);
  if (summary.blocked) throw new WbsError(409, "仍有有效的要求修改審查。");
  if (summary.approvalReviewIds.length < state.policy.minimumApprovals)
    throw new WbsError(409, "有效核准數不足，請重新確認審查者目前權限。");
  return {
    id,
    number,
    proposalId: item.id,
    proposalVersion: item.version,
    revisionId: item.candidateRevisionId,
    previousBaselineId: state.baselineId,
    policy: state.policy,
    approvalReviewIds: summary.approvalReviewIds,
    publishedBy: actor,
    at,
  };
}
