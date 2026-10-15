import type { ExpenseFailureReason as ExpenseDomainFailureReason } from "../../domain/aggregates/expense.js";

export type ExpenseOperationFailureReason =
  | "invalid-record"
  | "access-denied"
  | "not-found"
  | "recognition-conflict"
  | "recognition-cooldown"
  | "not-a-receipt"
  | "recognition-unavailable";

export type ExpenseFailureReason = ExpenseDomainFailureReason | ExpenseOperationFailureReason;

/** Failures at Expense qualification, persistence and receipt-recognition boundaries. */
export class ExpenseOperationError extends Error {
  constructor(
    public readonly reason: ExpenseOperationFailureReason,
    message: string,
  ) {
    super(message);
  }
}
