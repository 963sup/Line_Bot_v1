import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { Organization, OrganizationOwnerAssignment } from "../../domain.js";
import type {
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../organization-governance.js";
export interface OrganizationOwnerTransaction {
  readonly organization: Organization;
  authorize(): Promise<void>;
  replay(): Promise<OrganizationReceipt | null>;
  membership(): Promise<{ status: "active" | "removed"; version: number } | null>;
  load(): Promise<OrganizationOwnerAssignment | null>;
  activeTargetVersion(): Promise<number | null>;
  targetEffective(): Promise<boolean>;
  anotherEffective(): Promise<boolean>;
  save(next: OrganizationOwnerAssignment): Promise<number>;
  record(result: OrganizationReceipt): Promise<void>;
}
export interface OrganizationOwnerTransactions {
  transact(
    actor: VerifiedLineActor,
    scope: { organizationAccountId: string; targetUserId: string },
    evidence: OrganizationMutationEvidence,
    operation: (transaction: OrganizationOwnerTransaction) => Promise<OrganizationReceipt>,
  ): Promise<OrganizationReceipt>;
}
