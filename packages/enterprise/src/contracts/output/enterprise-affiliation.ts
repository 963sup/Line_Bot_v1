import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { EnterpriseDirectAffiliationState, EnterpriseInvitationState } from "../../domain.js";
import type { EnterpriseCommand, EnterpriseReceipt } from "../enterprise-governance.js";

export type EnterpriseAffiliationCommand = Extract<
  EnterpriseCommand,
  {
    action:
      | "invite-user"
      | "accept-invitation"
      | "decline-invitation"
      | "cancel-invitation"
      | "remove-direct-affiliation"
      | "leave-enterprise";
  }
>;

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
  transact(
    actor: VerifiedLineActor,
    command: EnterpriseAffiliationCommand,
    at: number,
    operation: (transaction: EnterpriseAffiliationTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
