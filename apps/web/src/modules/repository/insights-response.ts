import { parseRepositoryPulse } from "@line_bot_v1/insights/contracts/dto/repository-pulse";

/** Select only the fields rendered by this read-only Web presentation. */
export function insightsView(value: unknown) {
  const pulse = parseRepositoryPulse(value);
  const issues = pulse.issues.status === "available" ? pulse.issues.value : null;
  return {
    canManageRepository:
      value !== null &&
      typeof value === "object" &&
      Reflect.get(value, "canManageRepository") === true,
    from: pulse.period.from,
    to: pulse.period.to,
    observedAt: pulse.observedAt,
    issues: issues
      ? {
          created: issues.created,
          closed: issues.closed,
          reopened: issues.reopened,
          workflow: issues.workflow,
          legacyIssues: issues.coverage.legacyIssues,
          unstructuredEvents: issues.coverage.unstructuredEvents,
        }
      : null,
  };
}
