import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresCommercialDocuments } from "../../adapters/outbound/persistence/commercial-documents.js";
import { createCommercialDocuments } from "../../application/use-cases/commercial-documents.js";
import type { CommercialDraftSource } from "../../contracts/output/commercial-documents.js";
export function createPostgresCommercialDocuments(db: Database, source: CommercialDraftSource) {
  return createCommercialDocuments(
    new PostgresCommercialDocuments(db, createPostgresFileRevisionQualifier),
    source,
  );
}
