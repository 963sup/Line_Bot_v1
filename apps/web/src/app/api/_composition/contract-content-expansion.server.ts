import { createContractDocumentExpansionReader } from "@line_bot_v1/content/application/use-cases/contract-document-expansion";
import { createPostgresContractDocumentReader } from "@line_bot_v1/contract/composition/bootstrap/documents";
import type { Sql } from "@line_bot_v1/platform/postgres";

/** Application-host integration: Contract supplies its public reader; Content owns expansion rules. */
export function createPostgresContractDocumentExpansion(sql: Sql) {
  const contract = createPostgresContractDocumentReader(sql);
  return createContractDocumentExpansionReader({
    read: (actor, repositoryId, documentId, revisionId) =>
      contract.read(actor, { repositoryId, documentId, revisionId }),
  });
}
