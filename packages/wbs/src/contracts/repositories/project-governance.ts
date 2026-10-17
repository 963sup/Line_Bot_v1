import type { WbsRevision } from "../../domain/content.js";
import type { WbsPolicy } from "../../domain/governance.js";
import type {
  WbsBaseline,
  WbsGovernanceState,
  WbsProposal,
  WbsReview,
} from "../../domain/scope-governance.js";
import type {
  ProjectWbsGovernanceCommand,
  ProjectWbsGovernanceQuery,
  ProjectWbsGovernanceReceipt,
  ProjectWbsGovernanceView,
} from "../dto/project-governance.js";
import type { ProjectWbsWriteScope } from "./project-content.js";

export type ProjectWbsGovernanceChange = Readonly<{
  version: number;
  at: number;
  policy?: WbsPolicy;
  proposal?: WbsProposal;
  review?: Readonly<{ proposalId: string; value: WbsReview }>;
  baseline?: WbsBaseline;
}>;
export interface ProjectWbsGovernanceTransaction {
  readonly scope: ProjectWbsWriteScope;
  replay(): Promise<ProjectWbsGovernanceReceipt | null>;
  hasContent(): Promise<boolean>;
  loadState(): Promise<WbsGovernanceState>;
  loadProposal(id: string): Promise<WbsProposal | null>;
  loadRevision(id: string): Promise<WbsRevision>;
  loadBaseline(id: string): Promise<WbsBaseline>;
  loadReviews(proposal: WbsProposal, policy: WbsPolicy): Promise<readonly WbsReview[]>;
  nextId(): string;
  save(change: ProjectWbsGovernanceChange): Promise<ProjectWbsGovernanceReceipt>;
}
export interface ProjectWbsGovernanceStore {
  view(
    userId: string,
    selector: { projectId: string },
    query: ProjectWbsGovernanceQuery,
  ): Promise<ProjectWbsGovernanceView>;
  transact<T>(
    userId: string,
    command: ProjectWbsGovernanceCommand,
    operation: (transaction: ProjectWbsGovernanceTransaction) => Promise<T>,
  ): Promise<T>;
}
