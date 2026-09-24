import type { Expense } from "../../domain.js";

/** Resolves a verified subject to a currently active member; rejects otherwise. */
export type ActiveUser = (subject: string) => Promise<{ id: string }>;

/** Implementations own atomic windows and deduplication; arm/receive recheck membership in the transaction. */
export interface ReceiptIntakeStore {
  arm(scope: string, owner: string): Promise<void>;
  cancelIntent(scope: string, owner: string): Promise<void>;
  receive(scope: string, owner: string, imageId: string): Promise<Expense | null>;
}

export interface ReceiptIntakeDependencies {
  activeUser: ActiveUser;
  store(): ReceiptIntakeStore;
}
