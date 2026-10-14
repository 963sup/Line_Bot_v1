import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWbsMetrics } from "../../adapters/outbound/persistence/metrics.js";
import type { WbsMetricsQuery } from "../../contracts/output/metrics.js";
export function createPostgresWbsMetrics(db?: Database): WbsMetricsQuery {
  return new PostgresWbsMetrics(db);
}
