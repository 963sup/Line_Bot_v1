import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsRevision } from "../../domain/content.js";
import type { WbsPolicy } from "../../domain/governance.js";
import type {
  WbsBaseline,
  WbsGovernanceState,
  WbsProposal,
  WbsReview,
} from "../../domain/scope-governance.js";
import type {
  WbsGovernanceCommand,
  WbsGovernanceQuery,
  WbsGovernanceReceipt,
  WbsGovernanceView,
} from "../dto/governance.js";
import type { WbsWriteScope } from "./content.js";

export type WbsGovernanceChange = Readonly<{
  version: number;
  at: number;
  policy?: WbsPolicy;
  proposal?: WbsProposal;
  review?: Readonly<{ proposalId: string; value: WbsReview }>;
  baseline?: WbsBaseline;
}>;

export interface WbsGovernanceTransaction {
  readonly scope: WbsWriteScope;
  replay(): Promise<WbsGovernanceReceipt | null>;
  hasContent(): Promise<boolean>;
  loadState(): Promise<WbsGovernanceState>;
  loadProposal(id: string): Promise<WbsProposal | null>;
  loadRevision(id: string): Promise<WbsRevision>;
  loadBaseline(id: string): Promise<WbsBaseline>;
  loadReviews(proposal: WbsProposal, policy: WbsPolicy): Promise<readonly WbsReview[]>;
  nextId(): string;
  save(change: WbsGovernanceChange): Promise<WbsGovernanceReceipt>;
}

export interface WbsGovernanceStore {
  view(
    userId: string,
    selector: RepositorySelector,
    query: WbsGovernanceQuery,
  ): Promise<WbsGovernanceView>;
  transact<T>(
    userId: string,
    command: WbsGovernanceCommand,
    operation: (transaction: WbsGovernanceTransaction) => Promise<T>,
  ): Promise<T>;
}
