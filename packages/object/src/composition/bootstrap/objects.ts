import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresObjects } from "../../adapters/outbound/persistence/objects.js";
import type { ObjectReads, ObjectTransactions } from "../../contracts/output/objects.js";

export function createPostgresObjectDependencies(db?: Database): {
  reads: ObjectReads;
  transactions: ObjectTransactions;
} {
  const persistence = new PostgresObjects(db);
  return { reads: persistence, transactions: persistence };
}
