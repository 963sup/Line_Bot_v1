import { createPostgresContentPlanReferenceReader } from "@line_bot_v1/content/composition/bootstrap/plan-references";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresContracts } from "../../adapters/outbound/persistence/contracts.js";
import type { ContractReads, ContractTransactions } from "../../contracts/output/contracts.js";

export function createPostgresContractDependencies(db: Database = businessDatabase()): {
  reads: ContractReads;
  transactions: ContractTransactions;
} {
  const persistence = new PostgresContracts(createPostgresContentPlanReferenceReader, db);
  return { reads: persistence, transactions: persistence };
}
