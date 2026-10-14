import type { PulseSource, RepositoryPulse } from "../../contracts/dto/repository-pulse.js";
import type { RepositoryMetrics } from "../../contracts/output/repository-metrics.js";
import { type PulseQuery, pulseQuery } from "../queries/repository-pulse.js";

function source<T>(result: PromiseSettledResult<T>): PulseSource<T> {
  if (result.status === "fulfilled") return { status: "available", value: result.value };
  const error: unknown = result.reason;
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    [401, 403, 404].includes(Number(error.status))
  )
    throw error;
  return { status: "unavailable", value: null };
}
export function createRepositoryPulse(deps: RepositoryMetrics & { now(): number }) {
  return {
    async read(userId: string, input: PulseQuery): Promise<RepositoryPulse> {
      const observedAt = deps.now(),
        period = pulseQuery(input, observedAt);
      await deps.qualify(userId, period.repositoryId);
      const [issues, wbs] = await Promise.allSettled([
        deps.issues.read(userId, period.repositoryId, period.from, period.to),
        deps.wbs.read(userId, period.repositoryId),
      ]);
      return {
        repositoryId: period.repositoryId,
        period: { from: period.from, to: period.to, timeZone: period.timeZone },
        observedAt,
        issues: source(issues),
        wbs: source(wbs),
      };
    },
  };
}
