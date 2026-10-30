import assert from "node:assert/strict";
import { test } from "node:test";
import { readExpense, readReceipt } from "../src/contracts/dto/parse-expense.js";

test("Expense decoder retains confirmation vocabulary and nullable recognition fields", () => {
  const expense = {
    id: "expense",
    number: 1,
    merchant: "shop",
    amount: "2",
    currency: "TWD",
    date: "2026-10-29",
    invoiceNumber: "",
    payment: "advance",
    status: "confirmed",
    revision: 1,
    createdAt: 10,
  };
  assert.deepEqual(readExpense(expense), expense);
  assert.throws(() => readExpense({ ...expense, status: "paid" }));
  const receipt = { merchant: null, amount: null, currency: null, date: null, invoiceNumber: null };
  assert.deepEqual(readReceipt(receipt), receipt);
  assert.throws(() => readReceipt({ ...receipt, amount: 2 }));
});
