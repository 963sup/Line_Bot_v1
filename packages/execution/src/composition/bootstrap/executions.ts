import { createPostgresContentPlanReferenceReader } from "@line_bot_v1/content/composition/bootstrap/plan-references";
import { createPostgresContractReferenceReader } from "@line_bot_v1/contract/composition/bootstrap/references";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { createPostgresResourceReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/resource-references";
import { PostgresExecutions } from "../../adapters/outbound/persistence/executions.js";
import type { ExecutionReads, ExecutionTransactions } from "../../contracts/output/executions.js";

export function createPostgresExecutionDependencies(db: Database = businessDatabase()): {
  reads: ExecutionReads;
  transactions: ExecutionTransactions;
} {
  const persistence = new PostgresExecutions(
    createPostgresContractReferenceReader,
    createPostgresContentPlanReferenceReader,
    createPostgresResourceReferenceReader,
    db,
  );
  return { reads: persistence, transactions: persistence };
}
