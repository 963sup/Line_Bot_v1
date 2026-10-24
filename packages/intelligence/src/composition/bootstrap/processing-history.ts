import type { Sql } from "@line_bot_v1/platform/postgres";
import { createPostgresProcessingHistoryReader } from "../../adapters/outbound/persistence/processing-history.js";
import type { ProcessingHistoryReader } from "../../contracts/output/processing-history.js";

/** Public composition for consumers that need retained extraction evidence. */
export function createPostgresProcessingHistory(sql: Sql): ProcessingHistoryReader {
  return createPostgresProcessingHistoryReader(sql);
}
