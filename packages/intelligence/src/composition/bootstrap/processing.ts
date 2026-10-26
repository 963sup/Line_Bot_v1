import {
  createPostgresFileRevisionQualifier,
  createPostgresFileSourceReader,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import { type Database } from "@line_bot_v1/platform/postgres";
import { PostgresIntelligenceProcessing } from "../../adapters/outbound/persistence/processing.js";
import { PostgresLegacyProcessingHistory } from "../../adapters/outbound/persistence/legacy-processing.js";
import { createIntelligenceProcessing } from "../../application/use-cases/processing.js";

export function createPostgresIntelligenceProcessing(
  db?: Database,
  now = Date.now,
  sourceReader?: FileSourceReader,
) {
  const store = new PostgresIntelligenceProcessing(
    createPostgresFileRevisionQualifier,
    db,
    new PostgresLegacyProcessingHistory(db),
  );
  const source = sourceReader ?? createPostgresFileSourceReader(db);
  return createIntelligenceProcessing({ store, source, now });
}
