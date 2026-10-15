import { randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { numericValue } from "@line_bot_v1/platform/validation";
import { ExpenseOperationError } from "../../../contracts/dto/expense-failure.js";
import type { ReceiptIntakeStore } from "../../../contracts/ports/receipt-intake.js";
import type { ExpenseRepository } from "../../../contracts/repositories/expense-repository.js";
import {
  applyExpenseCommand,
  type Expense,
  type ExpenseCommand,
  ExpenseError,
  parsePersistedExpense,
} from "../../../domain/aggregates/expense.js";

function expenseNumber(value: unknown): number {
  const number = Number(numericValue(value));
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new ExpenseOperationError("invalid-record", "支出編號格式不完整。");
  }
  return number;
}

export class PostgresExpenseStore implements ReceiptIntakeStore, ExpenseRepository {
  constructor(private db: Database = businessDatabase()) {}
  private async activeOwner(sql: Sql, owner: string) {
    if (!(await readActiveUserQualification(sql, owner, "update"))) {
      throw new ExpenseOperationError("access-denied", "會員目前無法操作支出。");
    }
  }
  arm(scope: string, owner: string, now = Date.now()) {
    return this.db.transaction(async (sql) => {
      await this.activeOwner(sql, owner);
      await sql.query("DELETE FROM receipt_intents WHERE expires<=$1", [now]);
      await sql.query(
        "INSERT INTO receipt_intents VALUES($1,$2,$3) ON CONFLICT(scope,owner) DO UPDATE SET expires=excluded.expires",
        [scope, owner, now + 120_000],
      );
    });
  }
  cancelIntent(scope: string, owner: string) {
    return this.db.transaction(async (sql) => {
      await sql.query("DELETE FROM receipt_intents WHERE scope=$1 AND owner=$2", [scope, owner]);
    });
  }
  private async event(sql: Sql, d: Expense, type: string) {
    await sql.query("INSERT INTO expense_events(expense_id,type,revision,at) VALUES($1,$2,$3,$4)", [
      d.id,
      type,
      d.revision,
      Date.now(),
    ]);
  }
  private async write(sql: Sql, d: Expense) {
    await sql.query("UPDATE expenses SET body=$2::jsonb WHERE id=$1", [d.id, JSON.stringify(d)]);
  }
  receive(
    scope: string,
    owner: string,
    imageId: string,
    now = Date.now(),
  ): Promise<Expense | null> {
    return this.db.transaction(async (sql) => {
      await this.activeOwner(sql, owner);
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        JSON.stringify([scope, owner]),
      ]);
      if (
        (
          await sql.query("SELECT id FROM expenses WHERE scope=$1 AND owner=$2 AND image_id=$3", [
            scope,
            owner,
            imageId,
          ])
        ).rows.length
      )
        return null;
      const intent = (
        await sql.query(
          "DELETE FROM receipt_intents WHERE scope=$1 AND owner=$2 AND expires>$3 RETURNING scope",
          [scope, owner, now],
        )
      ).rows[0];
      if (!intent) return null;
      const d: Expense = {
        id: randomUUID(),
        number: 0,
        owner,
        scope,
        imageId,
        status: "pending",
        revision: 1,
        createdAt: now,
        merchant: "",
        amount: "",
        currency: "",
        date: "",
        invoiceNumber: "",
        payment: "",
      };
      const row = (
        await sql.query<{ number: number }>(
          "INSERT INTO expenses(id,owner,scope,image_id,body) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING number",
          [d.id, owner, scope, imageId, JSON.stringify(d)],
          (value) => ({ number: expenseNumber(value.number) }),
        )
      ).rows[0];
      if (!row) throw new ExpenseOperationError("invalid-record", "支出建立結果不完整。");
      d.number = Number(row.number);
      await this.write(sql, d);
      await this.event(sql, d, "attention_required");
      return d;
    });
  }
  private async getFrom(sql: Sql, id: string, owner: string, lock = false): Promise<Expense> {
    const row = (
      await sql.query<{ body: Expense }>(
        `SELECT body FROM expenses WHERE id=$1 AND owner=$2${lock ? " FOR UPDATE" : ""}`,
        [id, owner],
        (value) => {
          try {
            return { body: parsePersistedExpense(value.body) };
          } catch (error) {
            if (error instanceof ExpenseError)
              throw new ExpenseOperationError("invalid-record", "支出資料格式不完整。");
            throw error;
          }
        },
      )
    ).rows[0];
    if (!row) throw new ExpenseOperationError("not-found", "資料不存在或你無權處理。");
    return row.body;
  }
  get(id: string, owner: string) {
    return this.db.transaction((sql) => this.getFrom(sql, id, owner));
  }
  command(id: string, owner: string, command: ExpenseCommand) {
    return this.db.transaction(async (sql) => {
      await this.activeOwner(sql, owner);
      const previous = await this.getFrom(sql, id, owner, true),
        next = applyExpenseCommand(previous, command);
      if (previous !== next) {
        await this.write(sql, next);
        await this.event(sql, next, command.type);
      }
      return next;
    });
  }
}
