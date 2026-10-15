import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { EnterpriseReceipt } from "../enterprise-governance.js";
import type { EnterpriseLifecycleRepository } from "../repositories/enterprise-lifecycle.js";

export interface EnterpriseLifecycleTransaction {
  readonly ownerQualification: boolean;
  readonly enterprises: EnterpriseLifecycleRepository;
  replay(): Promise<EnterpriseReceipt | null>;
  record(receipt: EnterpriseReceipt): Promise<void>;
}

export interface EnterpriseLifecycleTransactions {
  transact(
    actor: VerifiedLineActor,
    enterpriseAccountId: string,
    evidence: { requestId: string; payload: string; reason: string; at: number },
    operation: (transaction: EnterpriseLifecycleTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt>;
}
