import { createPostgresSavedFileResults } from "@line_bot_v1/file/composition/bootstrap/files";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { createPostgresResourceReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/resource-references";
import { PostgresContentPlans } from "../../adapters/outbound/persistence/plans.js";
import type { ContentPlanReads, ContentPlanTransactions } from "../../contracts/output/plans.js";

export function createPostgresContentPlanDependencies(db: Database = businessDatabase()): {
  reads: ContentPlanReads;
  transactions: ContentPlanTransactions;
} {
  const persistence = new PostgresContentPlans(
    createPostgresResourceReferenceReader,
    createPostgresSavedFileResults,
    db,
  );
  return { reads: persistence, transactions: persistence };
}
