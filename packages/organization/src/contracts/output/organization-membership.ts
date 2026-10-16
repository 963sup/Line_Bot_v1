import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { OrganizationDirectMembership, OrganizationInvitation } from "../../domain.js";
import type {
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../organization-governance.js";

export interface OrganizationMembershipTransaction {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly organizationStatus: "active" | "inactive";
  authorizeOwner(): Promise<void>;
  replay(): Promise<OrganizationReceipt | null>;
  membershipActive(): Promise<boolean>;
  directMembership(): Promise<OrganizationDirectMembership | null>;
  invitation(): Promise<OrganizationInvitation | null>;
  requireActiveTarget(): Promise<void>;
  hasOtherSource(): Promise<boolean>;
  assertDirectSourceRemovable(): Promise<void>;
  saveDirect(next: OrganizationDirectMembership): Promise<number>;
  saveInvitation(next: OrganizationInvitation): Promise<number>;
  refreshMembership(): Promise<void>;
  record(result: OrganizationReceipt): Promise<void>;
}

export interface OrganizationMembershipTransactions {
  /** A null target binds the verified actor of this transaction. */
  transact(
    actor: VerifiedLineActor,
    scope: { organizationAccountId: string; targetUserId: string | null },
    evidence: OrganizationMutationEvidence,
    operation: (transaction: OrganizationMembershipTransaction) => Promise<OrganizationReceipt>,
  ): Promise<OrganizationReceipt>;
}
