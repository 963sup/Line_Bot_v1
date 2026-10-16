import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { Organization } from "../../domain.js";
import type {
  OrganizationMemberCreationPolicy,
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../organization-governance.js";

export interface OrganizationCreationTransaction {
  replay(): Promise<OrganizationReceipt | null>;
  nextOrganizationAccountId(): string;
  provision(
    organization: Organization,
    locator: Readonly<{ login: string; name: string }>,
  ): Promise<number>;
  record(result: OrganizationReceipt): Promise<void>;
}

export interface OrganizationMemberPolicyTransaction {
  readonly organization: Organization;
  authorizeOwner(): Promise<void>;
  replay(): Promise<OrganizationReceipt | null>;
  save(
    next: Organization,
    expectedVersion: number,
    policy: OrganizationMemberCreationPolicy,
  ): Promise<number>;
  record(result: OrganizationReceipt): Promise<void>;
}

export interface OrganizationScopeTransactions {
  transactCreation(
    actor: VerifiedLineActor,
    evidence: OrganizationMutationEvidence,
    operation: (transaction: OrganizationCreationTransaction) => Promise<OrganizationReceipt>,
  ): Promise<OrganizationReceipt>;
  transactMemberPolicy(
    actor: VerifiedLineActor,
    scope: Readonly<{ organizationAccountId: string }>,
    evidence: OrganizationMutationEvidence,
    operation: (transaction: OrganizationMemberPolicyTransaction) => Promise<OrganizationReceipt>,
  ): Promise<OrganizationReceipt>;
}
