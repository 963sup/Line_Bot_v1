import type { ReceiptReading } from "../../contracts/receipt-reading.js";
import type { Expense, ExpenseCommand } from "../../domain.js";

/** Storage owns transactionality and repeats the active User check when it changes data. */
export interface ExpenseRepository {
  get(id: string, owner: string): Promise<Expense>;
  command(id: string, owner: string, command: ExpenseCommand): Promise<Expense>;
  recognized(
    id: string,
    owner: string,
    revision: number,
    reading: ReceiptReading,
  ): Promise<Expense>;
}

/** Resolves a cryptographically verified LINE subject to its active stable User ID. */
export type ActiveExpenseUser = (subject: string) => Promise<{ id: string }>;
