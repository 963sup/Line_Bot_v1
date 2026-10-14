export type IssueMetrics = Readonly<{
  created: number;
  closed: number;
  reopened: number;
  workflow: Readonly<Record<"pending" | "active" | "review" | "completed", number>>;
  coverage: Readonly<{
    stateChanges: "recorded-events-only";
    legacyIssues: number;
    unstructuredEvents: number;
  }>;
}>;
export interface IssueMetricsQuery {
  read(userId: string, repositoryId: string, from: number, to: number): Promise<IssueMetrics>;
}
