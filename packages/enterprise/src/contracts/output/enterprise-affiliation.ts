import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { EnterpriseDirectAffiliationState, EnterpriseInvitationState } from "../../domain.js";
import type { EnterpriseMutationEvidence, EnterpriseReceipt } from "../enterprise-governance.js";

export interface EnterpriseAffiliationTransaction {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly enterpriseStatus: "active" | "inactive";
  authorizeOwner(): Promise<void>;
  replay(): Promise<EnterpriseReceipt | null>;
  loadDirect(): Promise<EnterpriseDirectAffiliationState | null>;
  loadInvitation(): Promise<EnterpriseInvitationState | null>;
  hasEffectiveAffiliation(): Promise<boolean>;
  requireActiveTarget(): Promise<void>;
  hasOtherAffiliation(): Promise<boolean>;
  isEffectiveOwner(): Promise<boolean>;
  hasReplacementOwner(): Promise<boolean>;
  saveDirect(next: EnterpriseDirectAffiliationState): Promise<number>;
  saveInvitation(next: EnterpriseInvitationState): Promise<number>;
  revokeOwner(): Promise<void>;
  record(result: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseAffiliationTransactions {
  /** A null target binds the verified actor of this transaction. */
  transact(
    actor: VerifiedLineActor,
    scope: { enterpriseAccountId: string; targetUserId: string | null },
    evidence: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseAffiliationTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
