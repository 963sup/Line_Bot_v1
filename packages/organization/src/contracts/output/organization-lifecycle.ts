import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import type { OrganizationReceipt } from "../organization-governance.js";
import type { OrganizationLifecycleRepository } from "../repositories/organization-lifecycle.js";

export interface OrganizationLifecycleTransaction {
  readonly ownerQualification: Readonly<{ activeOwner: boolean; lifecycleOwner: boolean }>;
  readonly organizations: OrganizationLifecycleRepository;
  replay(): Promise<OrganizationReceipt | null>;
  record(receipt: OrganizationReceipt): Promise<void>;
}

export interface OrganizationLifecycleTransactions {
  transact(
    actor: VerifiedLineActor,
    organizationAccountId: string,
    evidence: { requestId: string; payload: string; reason: string; at: number },
    operation: (transaction: OrganizationLifecycleTransaction) => Promise<OrganizationReceipt>,
  ): Promise<OrganizationReceipt>;
}
