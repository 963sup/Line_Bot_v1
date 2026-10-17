import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectWbsMetrics } from "../../adapters/outbound/persistence/project-metrics.js";
import type { ProjectWbsMetricsQuery } from "../../contracts/output/project-metrics.js";
export function createPostgresProjectWbsMetrics(db?: Database): ProjectWbsMetricsQuery {
  return new PostgresProjectWbsMetrics(db);
}
