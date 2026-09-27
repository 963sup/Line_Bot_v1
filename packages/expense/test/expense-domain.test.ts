import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyExpenseCommand,
  type Expense,
  ExpenseError,
  validateExpenseFields,
} from "../src/domain.js";

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
  const legacy = { ...draft(), project: "historical-project-label" } as Expense & {
    project: string;
  };
  const next = applyExpenseCommand(legacy, {
    type: "save",
    revision: legacy.revision,
    fields: { ...editable, merchant: "Updated" },
  });

  assert.equal((next as Expense & { project?: string }).project, "historical-project-label");
  assert.equal(next.merchant, "Updated");
});
