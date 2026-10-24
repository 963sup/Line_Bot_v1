import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresContractDocuments } from "../../adapters/outbound/persistence/documents.js";
import { createContractDocuments } from "../../application/use-cases/documents.js";

export function createPostgresContractDocuments(db: Database = businessDatabase()) {
  const transactions = new PostgresContractDocuments(db);
  return createContractDocuments({ transactions, now: Date.now });
}
