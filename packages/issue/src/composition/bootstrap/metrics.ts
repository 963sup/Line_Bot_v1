import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresIssueMetrics } from "../../adapters/outbound/persistence/metrics.js";
import type { IssueMetricsQuery } from "../../contracts/output/metrics.js";
export function createPostgresIssueMetrics(db?: Database): IssueMetricsQuery {
  return new PostgresIssueMetrics(db);
}
