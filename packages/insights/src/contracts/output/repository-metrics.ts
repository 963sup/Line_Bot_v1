import type { IssueMetricsQuery } from "@line_bot_v1/issue/contracts/output/metrics";
import type { WbsMetricsQuery } from "@line_bot_v1/wbs/contracts/output/metrics";
export type RepositoryMetrics = Readonly<{
  qualify(userId: string, repositoryId: string): Promise<void>;
  issues: IssueMetricsQuery;
  wbs: WbsMetricsQuery;
}>;
