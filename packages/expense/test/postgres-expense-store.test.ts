import assert from "node:assert/strict";
import { test } from "node:test";
import { createSql, type Database, type SqlResult } from "@line_bot_v1/platform/postgres";
import { PostgresExpenseStore } from "../src/adapters/outbound/persistence/postgres-expense-store.js";
import { type Expense, parsePersistedExpense } from "../src/domain/aggregates/expense.js";

test("receive decodes node-postgres bigint expense numbers", async () => {
  let persisted: Expense | undefined;
  const db: Database = {
    transaction: async (work) =>
      work(
        createSql(async (text, values): Promise<SqlResult> => {
          if (text.includes("FROM users WHERE id=$1")) {
            return {
              rows: [
                {
                  id: "owner",
                  status: "active",
                  status_version: 1,
                  auth_user_id: null,
                  createdAt: "1",
                },
              ],
            };
          }
          if (text.includes("SELECT id FROM expenses")) return { rows: [] };
          if (text.includes("DELETE FROM receipt_intents") && text.includes("RETURNING scope")) {
            return { rows: [{ scope: "group:A" }] };
          }
          if (text.includes("INSERT INTO expenses") && text.includes("RETURNING number")) {
            return { rows: [{ number: "42" }] };
          }
          if (text.includes("UPDATE expenses SET body")) {
            persisted = parsePersistedExpense(JSON.parse(String(values?.[1])));
          }
          return { rows: [] };
        }),
      ),
  };
  const expense = await new PostgresExpenseStore(db).receive("group:A", "owner", "image", 123);

  assert.equal(expense?.number, 42);
  assert.equal(persisted?.number, 42);
});
