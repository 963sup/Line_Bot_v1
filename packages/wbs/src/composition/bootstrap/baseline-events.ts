import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWbsBaselineEvents } from "../../adapters/outbound/persistence/baseline-events.js";
import type { WbsBaselineEvents } from "../../contracts/output/baseline-events.js";
export function createPostgresWbsBaselineEvents(db: Database): WbsBaselineEvents {
  return new PostgresWbsBaselineEvents(db);
}
