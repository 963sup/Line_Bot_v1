import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresLegacyWbsEntryQuery } from "../../adapters/outbound/persistence/legacy-entry.js";
import type { LegacyWbsEntryQuery } from "../../contracts/output/legacy-entry.js";

export function createPostgresLegacyWbsEntryQuery(db?: Database): LegacyWbsEntryQuery {
  return new PostgresLegacyWbsEntryQuery(db);
}
