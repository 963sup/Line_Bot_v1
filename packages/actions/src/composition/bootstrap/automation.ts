import type { Database } from "@line_bot_v1/platform/postgres";
import { createPostgresWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/baseline-events";
import { PostgresActionPersistence } from "../../adapters/outbound/persistence/automation.js";
import type { ActionTransactions } from "../../contracts/output/automation.js";
import type { ActionRunQueue } from "../../contracts/output/worker.js";

export function createPostgresActionDependencies(db: Database): {
  transactions: ActionTransactions;
  queue: ActionRunQueue;
} {
  const persistence = new PostgresActionPersistence(db, (sql) =>
    createPostgresWbsBaselineEvents({ transaction: async (work) => work(sql) }),
  );
  return { transactions: persistence, queue: persistence };
}
