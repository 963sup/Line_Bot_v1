import type { FileRevisionQualifier } from "@line_bot_v1/file/contracts/output/references";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { PostgresCommercialDocuments } from "../../adapters/outbound/persistence/commercial-documents.js";
import { createCommercialDocuments } from "../../application/use-cases/commercial-documents.js";
import type { CommercialDraftSource } from "../../contracts/output/commercial-documents.js";
export function createPostgresCommercialDocuments(
  db: Database,
  source: CommercialDraftSource,
  qualifier: (sql: Sql) => FileRevisionQualifier,
) {
  return createCommercialDocuments(
    new PostgresCommercialDocuments(db, qualifier),
    source,
  );
}
