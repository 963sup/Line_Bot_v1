import type { Expense } from "../../domain/aggregates/expense.js";

export type ExpenseApiView = Pick<
  Expense,
  | "id"
  | "number"
  | "merchant"
  | "amount"
  | "currency"
  | "date"
  | "invoiceNumber"
  | "payment"
  | "status"
  | "revision"
  | "createdAt"
>;

export function toExpenseApiView(expense: Expense): ExpenseApiView {
  return {
    id: expense.id,
    number: expense.number,
    merchant: expense.merchant,
    amount: expense.amount,
    currency: expense.currency,
    date: expense.date,
    invoiceNumber: expense.invoiceNumber,
    payment: expense.payment,
    status: expense.status,
    revision: expense.revision,
    createdAt: expense.createdAt,
  };
}
