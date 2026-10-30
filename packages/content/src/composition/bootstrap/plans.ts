import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type { ResourceReferenceReader } from "@line_bot_v1/resources/contracts/output/resource-references";
import { PostgresContentPlans } from "../../adapters/outbound/persistence/plans.js";
import { createContentPlans } from "../../application/use-cases/plans.js";
import type { ContractDocumentExpansionReader } from "../../contracts/output/plans.js";
import { ContentError } from "../../domain/error.js";

type ContractDocumentExpansionFactory = (sql: Sql) => ContractDocumentExpansionReader;
const unavailableContractDocuments: ContractDocumentExpansionFactory = () => ({
  readConfirmed: async () => {
    throw new ContentError(503, "Contract document mapping is not composed.", "UNAVAILABLE");
  },
});

export function createPostgresContentPlans(
  config: Readonly<{
    db?: Database;
    contractDocuments?: ContractDocumentExpansionFactory;
    resourceReader: (sql: Sql) => ResourceReferenceReader;
    now?: () => number;
  }>,
) {
  const persistence = new PostgresContentPlans(
    config.resourceReader,
    config.contractDocuments ?? unavailableContractDocuments,
    config.db ?? businessDatabase(),
  );
  return createContentPlans({
    reads: persistence,
    transactions: persistence,
    now: config.now ?? Date.now,
  });
}
