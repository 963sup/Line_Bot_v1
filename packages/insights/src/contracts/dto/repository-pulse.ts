import type { IssueMetrics } from "@line_bot_v1/issue/contracts/output/metrics";
export type PulseSource<T> =
  | Readonly<{ status: "available"; value: T }>
  | Readonly<{ status: "unavailable"; value: null }>;
export type RepositoryPulse = Readonly<{
  repositoryId: string;
  period: Readonly<{ from: number; to: number; timeZone: "Asia/Taipei" }>;
  observedAt: number;
  issues: PulseSource<IssueMetrics>;
}>;
export type RepositoryPulseResponse = Omit<RepositoryPulse, "repositoryId"> &
  Readonly<{ repositoryId?: string }>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Insights 回應格式不正確。");
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = item;
  return result;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Insights 指標格式不正確。");
  }
  return value;
}

/** Validate the repository pulse contract without fabricating unavailable owner data. */
export function parseRepositoryPulse(value: unknown): RepositoryPulseResponse {
  const pulse = record(value);
  const period = record(pulse.period);
  if (period.timeZone !== "Asia/Taipei") throw new Error("Insights 時區格式不正確。");

  let issues: RepositoryPulse["issues"];
  const source = record(pulse.issues);
  if (source.status === "unavailable" && source.value === null) {
    issues = { status: "unavailable", value: null };
  } else {
    if (source.status !== "available") throw new Error("Insights 來源格式不正確。");
    const metrics = record(source.value);
    const workflow = record(metrics.workflow);
    const coverage = record(metrics.coverage);
    if (coverage.stateChanges !== "recorded-events-only") {
      throw new Error("Insights 歷史證據格式不正確。");
    }
    issues = {
      status: "available",
      value: {
        created: count(metrics.created),
        closed: count(metrics.closed),
        reopened: count(metrics.reopened),
        workflow: {
          pending: count(workflow.pending),
          active: count(workflow.active),
          review: count(workflow.review),
          completed: count(workflow.completed),
        },
        coverage: {
          stateChanges: "recorded-events-only",
          legacyIssues: count(coverage.legacyIssues),
          unstructuredEvents: count(coverage.unstructuredEvents),
        },
      },
    };
  }

  return {
    ...(typeof pulse.repositoryId === "string" ? { repositoryId: pulse.repositoryId } : {}),
    period: { from: count(period.from), to: count(period.to), timeZone: "Asia/Taipei" },
    observedAt: count(pulse.observedAt),
    issues,
  };
}
