import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyExpenseCommand,
  type Expense,
  ExpenseError,
  parsePersistedExpense,
  validateExpenseFields,
} from "../src/domain/aggregates/expense.js";

const draft = (overrides: Partial<Expense> = {}): Expense => ({
  id: "expense-id",
  number: 1,
  owner: "user-id",
  scope: "group:A",
  imageId: "image-id",
  status: "draft",
  revision: 1,
  createdAt: 1,
  merchant: "Demo",
  amount: "120",
  currency: "TWD",
  date: "2026-09-24",
  invoiceNumber: "",
  payment: "advance",
  ...overrides,
});

const editable = {
  merchant: "Demo",
  amount: "120",
  currency: "TWD",
  date: "2026-09-24",
  invoiceNumber: "",
  payment: "advance",
} as const;

test("Expense no longer authors a free-text Project surrogate", () => {
  assert.deepEqual(validateExpenseFields(editable, true), editable);
  assert.throws(
    () => validateExpenseFields({ ...editable, project: "legacy-project-name" }, true),
    (error) => error instanceof ExpenseError && error.status === 400,
  );
});

test("legacy persisted project text survives unrelated Expense updates without becoming editable", () => {
  const legacy: Expense & {
    project: string;
  } = { ...draft(), project: "historical-project-label" };
  const next = applyExpenseCommand(legacy, {
    type: "save",
    revision: legacy.revision,
    fields: { ...editable, merchant: "Updated" },
  });

  assert.deepEqual(next, { ...legacy, merchant: "Updated", revision: legacy.revision + 1 });
  assert.equal(next.merchant, "Updated");
});

test("persisted Expense decoding validates the JSONB aggregate and retains legacy fields", () => {
  const legacy = { ...draft(), project: "historical-project-label" };
  assert.deepEqual(parsePersistedExpense(legacy), legacy);
  assert.throws(
    () => parsePersistedExpense({ ...legacy, revision: "1" }),
    (error) => error instanceof ExpenseError && error.status === 500,
  );
});

test("explicit owner commands, not AI recognition, move pending Expense state", () => {
  const pending = draft({
    status: "pending",
    merchant: "",
    amount: "",
    currency: "",
    date: "",
    invoiceNumber: "",
    payment: "",
  });
  const saved = applyExpenseCommand(pending, {
    type: "save",
    revision: pending.revision,
    fields: editable,
  });
  assert.equal(saved.status, "draft");
  assert.equal(saved.revision, 2);
  assert.equal(saved.amount, "120");

  const confirmed = applyExpenseCommand(
    { ...pending, revision: 7 },
    { type: "confirm", revision: 7, fields: editable },
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.revision, 8);
});
