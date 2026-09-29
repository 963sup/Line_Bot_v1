import type { Expense, ExpenseCommand } from "../../domain/aggregates/expense.js";

/** Storage owns transactionality and repeats the active User check when it changes data. */
export interface ExpenseRepository {
  get(id: string, owner: string): Promise<Expense>;
  command(id: string, owner: string, command: ExpenseCommand): Promise<Expense>;
}

/** Resolves a cryptographically verified LINE subject to its active stable User ID. */
export type ActiveExpenseUser = (subject: string) => Promise<{ id: string }>;
