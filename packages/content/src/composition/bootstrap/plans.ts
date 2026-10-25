import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { createPostgresResourceReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/resource-references";
import { PostgresContentPlans } from "../../adapters/outbound/persistence/plans.js";
import type {
  ContentPlanReads,
  ContentPlanTransactions,
  ContractDocumentExpansionReader,
} from "../../contracts/output/plans.js";
import { ContentError } from "../../domain/error.js";

type ContractDocumentExpansionFactory = (sql: Sql) => ContractDocumentExpansionReader;
const unavailableContractDocuments: ContractDocumentExpansionFactory = () => ({
  readConfirmed: async () => {
    throw new ContentError(503, "Contract document mapping is not composed.", "UNAVAILABLE");
  },
});

export function createPostgresContentPlanDependencies(
  db: Database = businessDatabase(),
  contractDocuments: ContractDocumentExpansionFactory = unavailableContractDocuments,
): {
  reads: ContentPlanReads;
  transactions: ContentPlanTransactions;
} {
  const persistence = new PostgresContentPlans(
    createPostgresResourceReferenceReader,
    contractDocuments,
    db,
  );
  return { reads: persistence, transactions: persistence };
}
