import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsRevision } from "../contracts.js";
import type { WbsCheck, WbsDifference, WbsPolicy } from "../domain/governance.js";

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
export type WbsGovernanceQuery = Readonly<{
  proposalId?: string;
  baselineId?: string;
  beforeProposal?: number;
  beforeBaseline?: number;
  beforeReview?: number;
  proposalVersion?: number;
}>;
export type WbsGovernanceView = Readonly<{
  repository: { id: string; ownerLogin: string; name: string };
  actorUserId: string;
  archived: boolean;
  canPropose: boolean;
  canReview: boolean;
  canSetPolicy: boolean;
  version: number;
  policy: WbsPolicy;
  draftRevisionId: string | null;
  publishedBaseline: WbsBaseline | null;
  proposals: readonly WbsProposal[];
  nextProposal: number | null;
  baselines: readonly WbsBaseline[];
  nextBaseline: number | null;
  baseline: { baseline: WbsBaseline; revision: WbsRevision } | null;
  proposal: {
    proposal: WbsProposal;
    currentVersion: number;
    publication: WbsBaseline | null;
    candidate: WbsRevision;
    base: WbsRevision | null;
    differences: readonly WbsDifference[];
    failures: readonly WbsCheck[];
    reviews: readonly WbsReview[];
    nextReview: number | null;
    approvals: number;
    blocked: boolean;
    baseIsCurrent: boolean;
  } | null;
}>;
type CommandBase = Readonly<{ requestId: string; repositoryId: string; expectedVersion: number }>;
type ProposalBase = CommandBase & Readonly<{ proposalId: string; expectedProposalVersion: number }>;
export type WbsGovernanceCommand =
  | (CommandBase &
      Readonly<{
        action: "create-proposal";
        title: string;
        reason: string;
        candidateRevisionId: string;
        baseBaselineId: string | null;
      }>)
  | (ProposalBase &
      Readonly<{
        action: "revise-proposal";
        title: string;
        reason: string;
        candidateRevisionId: string;
        baseBaselineId: string | null;
      }>)
  | (ProposalBase & Readonly<{ action: "close-proposal" }>)
  | (ProposalBase &
      Readonly<{
        action: "review-proposal";
        expectedPolicyVersion: number;
        decision: "APPROVE" | "REQUEST_CHANGES";
        note: string;
      }>)
  | (ProposalBase & Readonly<{ action: "publish-proposal"; expectedPolicyVersion: number }>)
  | (CommandBase &
      Readonly<{
        action: "set-policy";
        expectedPolicyVersion: number;
        minimumApprovals: number;
        allowSelfApproval: boolean;
      }>);
export type WbsGovernanceReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  action: WbsGovernanceCommand["action"];
  version: number;
  proposalId: string | null;
  baselineId: string | null;
}>;
export interface WbsGovernanceStore {
  view(
    userId: string,
    selector: RepositorySelector,
    query: WbsGovernanceQuery,
  ): Promise<WbsGovernanceView>;
  execute(
    userId: string,
    command: WbsGovernanceCommand,
    now: number,
  ): Promise<WbsGovernanceReceipt>;
}
