import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type {
  EnterpriseOrganizationRelationState,
  EnterpriseOrganizationScopeState,
} from "../../domain.js";
import type { EnterpriseMutationEvidence, EnterpriseReceipt } from "../enterprise-governance.js";

export interface EnterpriseOrganizationTransaction {
  readonly enterprise: EnterpriseOrganizationScopeState;
  readonly organization: EnterpriseOrganizationScopeState;
  authorizeEnterprise(mode: "active-scope" | "current-assignment"): Promise<void>;
  organizationOwnerConsents(mode: "active-scope" | "current-assignment"): Promise<boolean>;
  replay(): Promise<EnterpriseReceipt | null>;
  load(): Promise<EnterpriseOrganizationRelationState | null>;
  hasTeamAssignments(): Promise<boolean>;
  save(next: EnterpriseOrganizationRelationState): Promise<number>;
  record(result: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseOrganizationTransactions {
  transact(
    actor: VerifiedLineActor,
    scope: { enterpriseAccountId: string; organizationAccountId: string },
    evidence: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseOrganizationTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
