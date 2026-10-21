import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresResources } from "../../adapters/outbound/persistence/resources.js";
import type { ResourceReads, ResourceTransactions } from "../../contracts/output/resources.js";

export function createPostgresResourceDependencies(db: Database = businessDatabase()): {
  reads: ResourceReads;
  transactions: ResourceTransactions;
} {
  const persistence = new PostgresResources(db);
  return { reads: persistence, transactions: persistence };
}
