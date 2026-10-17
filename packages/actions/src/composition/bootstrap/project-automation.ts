import type { Database } from "@line_bot_v1/platform/postgres";
import { createPostgresProjectWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/project-baseline-events";
import { PostgresProjectActionPersistence } from "../../adapters/outbound/persistence/project-automation.js";
import type { ProjectActionTransactions } from "../../contracts/output/project-automation.js";
import type { ProjectActionRunQueue } from "../../contracts/output/project-worker.js";

export function createPostgresProjectActionDependencies(db: Database): {
  transactions: ProjectActionTransactions;
  queue: ProjectActionRunQueue;
} {
  const persistence = new PostgresProjectActionPersistence(db, (sql) =>
    createPostgresProjectWbsBaselineEvents({ transaction: async (work) => work(sql) }),
  );
  return { transactions: persistence, queue: persistence };
}
