import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectWbsBaselineEvents } from "../../adapters/outbound/persistence/project-baseline-events.js";
import type { ProjectWbsBaselineEvents } from "../../contracts/output/project-baseline-events.js";
export function createPostgresProjectWbsBaselineEvents(db: Database): ProjectWbsBaselineEvents {
  return new PostgresProjectWbsBaselineEvents(db);
}
