import type { SqlRow } from "@line_bot_v1/platform/postgres";
import {
  isRecord,
  literalValue,
  numberValue,
  numericValue,
  record,
  stringArray,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { ProjectActionRule, ProjectActionRun } from "../../../domain/project-automation.js";
export function rule(value: unknown): ProjectActionRule {
  const r = record(value);
  if (typeof r.enabled !== "boolean") throw new TypeError("Invalid rule.");
  return {
    id: stringValue(r.id),
    projectId: stringValue(r.projectId),
    version: numberValue(r.version),
    kind: literalValue(r.kind, ["check-wbs-revision", "notify-wbs-baseline"]),
    recipients: stringArray(r.recipients),
    enabled: r.enabled,
    enabledAfter: numberValue(r.enabledAfter),
    delegationId: stringValue(r.delegationId),
    delegate: stringValue(r.delegate),
    delegateVersion: numberValue(r.delegateVersion),
  };
}
export function run(r: SqlRow): ProjectActionRun {
  if (!Array.isArray(r.results)) throw new TypeError("Invalid step results.");
  return {
    id: stringValue(r.id),
    projectId: stringValue(r.project_id),
    rule: rule(r.rule_snapshot),
    revisionId: stringValue(r.revision_id),
    baselineId: r.baseline_id === null ? null : stringValue(r.baseline_id),
    status: literalValue(r.status, [
      "queued",
      "running",
      "waiting",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    version: numberValue(r.version),
    step: numberValue(r.step),
    attempt: numberValue(r.attempt),
    due: Number(numericValue(r.available_at)),
    createdAt: Number(numericValue(r.created_at)),
    results: r.results.map((v: unknown) => {
      if (!isRecord(v)) throw new TypeError("Invalid result.");
      return { step: numberValue(v.step), value: v.value };
    }),
  };
}
