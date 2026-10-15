import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { Enterprise, EnterpriseIdentityState } from "../../domain.js";
import type { EnterpriseCommand, EnterpriseReceipt } from "../enterprise-governance.js";

export type EnterpriseIdentityCommand = Extract<
  EnterpriseCommand,
  { action: "create-enterprise" | "complete-enterprise-identity" }
>;

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
    command: Extract<EnterpriseIdentityCommand, { action: "create-enterprise" }>,
    at: number,
    operation: (transaction: EnterpriseProvisionTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
  complete(
    actor: VerifiedLineActor,
    command: Extract<EnterpriseIdentityCommand, { action: "complete-enterprise-identity" }>,
    at: number,
    operation: (transaction: EnterpriseIdentityTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
