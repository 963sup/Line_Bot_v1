import { createPostgresContractReferenceReader } from "@line_bot_v1/contract/composition/bootstrap/references";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresExecutions } from "../../adapters/outbound/persistence/executions.js";
import type { ExecutionReads, ExecutionTransactions } from "../../contracts/output/executions.js";

export function createPostgresExecutionDependencies(db: Database = businessDatabase()): {
  reads: ExecutionReads;
  transactions: ExecutionTransactions;
} {
  const persistence = new PostgresExecutions(createPostgresContractReferenceReader, db);
  return { reads: persistence, transactions: persistence };
}
