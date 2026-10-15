import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { EnterpriseOwnerAssignment } from "../../domain.js";
import type { EnterpriseCommand, EnterpriseReceipt } from "../enterprise-governance.js";

export type EnterpriseOwnerCommand = Extract<
  EnterpriseCommand,
  { action: "grant-enterprise-owner" | "revoke-enterprise-owner" }
>;

export interface EnterpriseOwnerTransaction {
  readonly enterpriseStatus: "active" | "inactive";
  authorize(): Promise<void>;
  replay(): Promise<EnterpriseReceipt | null>;
  hasDirectAffiliation(): Promise<boolean>;
  activeUserVersion(): Promise<number | null>;
  load(): Promise<EnterpriseOwnerAssignment | null>;
  isEffectiveOwner(): Promise<boolean>;
  hasReplacementOwner(): Promise<boolean>;
  save(next: EnterpriseOwnerAssignment): Promise<{ status: "active" | "revoked"; version: number }>;
  record(receipt: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseOwnerTransactions {
  transact(
    actor: VerifiedLineActor,
    command: EnterpriseOwnerCommand,
    at: number,
    operation: (transaction: EnterpriseOwnerTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
