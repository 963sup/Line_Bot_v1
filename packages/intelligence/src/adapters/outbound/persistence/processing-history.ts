import { createPostgresSavedFileResults } from "@line_bot_v1/file/composition/bootstrap/files";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type {
  ProcessingHistoryReader,
  VerifiedSavedProcessing,
} from "../../../contracts/output/processing-history.js";

/**
 * Temporary retention adapter for immutable legacy rows. It is deliberately
 * read-only: new processing writes must use an Intelligence-owned command
 * store, while this adapter preserves historical evidence during cutover.
 */
export function createPostgresProcessingHistoryReader(sql: Sql): ProcessingHistoryReader {
  const retained = createPostgresSavedFileResults(sql);
  return {
    async verifySaved(actor, repositoryId, reference): Promise<VerifiedSavedProcessing> {
      return retained.verifySaved(actor, repositoryId, reference);
    },
  };
}
