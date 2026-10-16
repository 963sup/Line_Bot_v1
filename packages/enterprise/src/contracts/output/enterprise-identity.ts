import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { Enterprise, EnterpriseIdentityState } from "../../domain.js";
import type { EnterpriseMutationEvidence, EnterpriseReceipt } from "../enterprise-governance.js";

export interface EnterpriseProvisionTransaction {
  replay(): Promise<EnterpriseReceipt | null>;
  nextId(): string;
  provisionForActor(enterprise: Enterprise, name: string, slug: string): Promise<number>;
  record(result: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseIdentityTransaction {
  readonly current: EnterpriseIdentityState;
  readonly status: "active" | "inactive";
  authorizeOwner(): Promise<void>;
  replay(): Promise<EnterpriseReceipt | null>;
  save(next: Readonly<{ name: string; slug: string; version: number }>): Promise<number>;
  record(result: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseIdentityTransactions {
  create(
    actor: VerifiedLineActor,
    evidence: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseProvisionTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
  complete(
    actor: VerifiedLineActor,
    enterpriseAccountId: string,
    evidence: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseIdentityTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
