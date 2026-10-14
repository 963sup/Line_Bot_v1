import type { IssueMetrics } from "@line_bot_v1/issue/contracts/output/metrics";
import type { WbsMetrics } from "@line_bot_v1/wbs/contracts/output/metrics";
export type PulseSource<T> =
  | Readonly<{ status: "available"; value: T }>
  | Readonly<{ status: "unavailable"; value: null }>;
export type RepositoryPulse = Readonly<{
  repositoryId: string;
  period: Readonly<{ from: number; to: number; timeZone: "Asia/Taipei" }>;
  observedAt: number;
  issues: PulseSource<IssueMetrics>;
  wbs: PulseSource<WbsMetrics>;
}>;
