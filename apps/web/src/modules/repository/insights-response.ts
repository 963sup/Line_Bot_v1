function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Insights 回應格式不正確。");
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = item;
  return result;
}
function count(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Insights 指標格式不正確。");
  return value;
}
function source(value: unknown) {
  const item = record(value);
  if (item.status === "unavailable" && item.value === null) return null;
  if (item.status !== "available") throw new Error("Insights 來源格式不正確。");
  return record(item.value);
}
/** Select only the fields rendered by this read-only Web presentation. */
export function insightsView(value: unknown) {
  const pulse = record(value),
    period = record(pulse.period);
  if (period.timeZone !== "Asia/Taipei") throw new Error("Insights 時區格式不正確。");
  const issues = source(pulse.issues);
  const workflow = issues ? record(issues.workflow) : null;
  const coverage = issues ? record(issues.coverage) : null;
  if (coverage && coverage.stateChanges !== "recorded-events-only")
    throw new Error("Insights 歷史證據格式不正確。");
  return {
    canManageRepository: pulse.canManageRepository === true,
    from: count(period.from),
    to: count(period.to),
    observedAt: count(pulse.observedAt),
    issues:
      issues && workflow && coverage
        ? {
            created: count(issues.created),
            closed: count(issues.closed),
            reopened: count(issues.reopened),
            workflow: {
              pending: count(workflow.pending),
              active: count(workflow.active),
              review: count(workflow.review),
              completed: count(workflow.completed),
            },
            legacyIssues: count(coverage.legacyIssues),
            unstructuredEvents: count(coverage.unstructuredEvents),
          }
        : null,
  };
}
