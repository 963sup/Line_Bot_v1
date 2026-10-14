import type { WbsRevision } from "../../domain/content.js";
import type { WbsCheck, WbsDifference, WbsPolicy } from "../../domain/governance.js";
import type { WbsBaseline, WbsProposal, WbsReview } from "../../domain/scope-governance.js";

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
