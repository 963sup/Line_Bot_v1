import assert from "node:assert/strict";
import { test } from "node:test";
import { type ExpenseApiView, toExpenseApiView } from "../src/contracts/dto/expense-api-view.js";
import type { Expense } from "../src/domain/aggregates/expense.js";

test("Expense API view serializes only its explicit allowlist", () => {
  const aggregate = {
    id: "00000000-0000-4000-8000-000000000001",
    number: 4,
    merchant: "Demo",
    amount: "1260",
    currency: "TWD",
    date: "2026-09-06",
    invoiceNumber: "INV-4",
    payment: "advance",
    status: "draft",
    revision: 3,
    createdAt: 10,
    owner: "private-user-id",
    scope: "private-group-id",
    imageId: "private-image-id",
    project: { legacy: true },
    futureInternalField: "must not escape",
  } as Expense;

  const view = toExpenseApiView(aggregate);
  const expected: ExpenseApiView = {
    id: aggregate.id,
    number: aggregate.number,
    merchant: aggregate.merchant,
    amount: aggregate.amount,
    currency: aggregate.currency,
    date: aggregate.date,
    invoiceNumber: aggregate.invoiceNumber,
    payment: aggregate.payment,
    status: aggregate.status,
    revision: aggregate.revision,
    createdAt: aggregate.createdAt,
  };
  assert.deepEqual(view, expected);
});
