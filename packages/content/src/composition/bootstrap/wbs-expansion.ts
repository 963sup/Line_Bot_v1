import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresContentWbsExpansionReader } from "../../adapters/outbound/persistence/wbs-expansion.js";

export function createPostgresContentWbsExpansionReader(sql: Sql) {
  return new PostgresContentWbsExpansionReader(sql);
}
