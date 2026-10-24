import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { createPostgresResourceReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/resource-references";
import { PostgresContentPlans } from "../../adapters/outbound/persistence/plans.js";
import type {
  ContentPlanReads,
  ContentPlanTransactions,
  ProcessingHistoryReader,
} from "../../contracts/output/plans.js";
import { ContentError } from "../../domain/error.js";

type ProcessingHistoryFactory = (sql: Sql) => ProcessingHistoryReader;

const unavailableProcessingHistory: ProcessingHistoryFactory = () => ({
  verifySaved: async () => {
    throw new ContentError(503, "Intelligence processing history is not composed.", "UNAVAILABLE");
  },
});

export function createPostgresContentPlanDependencies(
  db: Database = businessDatabase(),
  processingHistory: ProcessingHistoryFactory = unavailableProcessingHistory,
): {
  reads: ContentPlanReads;
  transactions: ContentPlanTransactions;
} {
  const persistence = new PostgresContentPlans(
    createPostgresResourceReferenceReader,
    processingHistory,
    db,
  );
  return { reads: persistence, transactions: persistence };
}
