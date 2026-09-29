import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresExpenseStore } from "../../adapters/outbound/persistence/postgres-expense-store.js";

export function createPostgresExpenseStore(database?: Database) {
  return new PostgresExpenseStore(database);
}
