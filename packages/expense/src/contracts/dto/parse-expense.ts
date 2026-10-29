import { isRecord } from "@line_bot_v1/platform/validation";
import type { ExpenseApiView } from "./expense-api-view.js";

type ReceiptReadingView = {
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  date: string | null;
  invoiceNumber: string | null;
};
export function readExpense(value: unknown): ExpenseApiView {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.number !== "number" ||
    typeof value.merchant !== "string" ||
    typeof value.amount !== "string" ||
    typeof value.currency !== "string" ||
    typeof value.date !== "string" ||
    typeof value.invoiceNumber !== "string" ||
    (value.payment !== "" &&
      value.payment !== "advance" &&
      value.payment !== "company" &&
      value.payment !== "unpaid") ||
    (value.status !== "pending" &&
      value.status !== "draft" &&
      value.status !== "confirmed" &&
      value.status !== "cancelled") ||
    typeof value.revision !== "number" ||
    typeof value.createdAt !== "number"
  )
    throw new Error("支出回應格式不完整。");
  return {
    id: value.id,
    number: value.number,
    merchant: value.merchant,
    amount: value.amount,
    currency: value.currency,
    date: value.date,
    invoiceNumber: value.invoiceNumber,
    payment: value.payment,
    status: value.status,
    revision: value.revision,
    createdAt: value.createdAt,
  };
}
export function readReceipt(value: unknown): ReceiptReadingView {
  if (!isRecord(value)) throw new Error("辨識回應格式不完整。");
  const nullable = (item: unknown) => item === null || typeof item === "string";
  if (
    !nullable(value.merchant) ||
    !nullable(value.amount) ||
    !nullable(value.currency) ||
    !nullable(value.date) ||
    !nullable(value.invoiceNumber)
  )
    throw new Error("辨識回應格式不完整。");
  return {
    merchant: value.merchant,
    amount: value.amount,
    currency: value.currency,
    date: value.date,
    invoiceNumber: value.invoiceNumber,
  };
}
