import { createPostgresContentPlanReferenceReader } from "@line_bot_v1/content/composition/bootstrap/plan-references";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresTaskDependencies } from "../../adapters/outbound/persistence/task-dependencies.js";
import type {
  TaskDependencyReads,
  TaskDependencyTransactions,
} from "../../contracts/output/task-dependencies.js";

export function createPostgresTaskDependencyDependencies(db: Database = businessDatabase()): {
  reads: TaskDependencyReads;
  transactions: TaskDependencyTransactions;
} {
  const persistence = new PostgresTaskDependencies(createPostgresContentPlanReferenceReader, db);
  return { reads: persistence, transactions: persistence };
}
