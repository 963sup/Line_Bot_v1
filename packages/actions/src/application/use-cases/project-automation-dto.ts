import type {
  ProjectActionReceipt,
  ProjectActionRuleDto,
  ProjectActionRunDto,
} from "../../contracts/dto/project-automation.js";
import type { ProjectActionRecord } from "../../contracts/output/project-automation.js";
import type { ProjectActionRule, ProjectActionRun } from "../../domain/project-automation.js";

export function projectActionRuleDto(rule: ProjectActionRule): ProjectActionRuleDto {
  return {
    id: rule.id,
    projectId: rule.projectId,
    version: rule.version,
    kind: rule.kind,
    recipients: [...rule.recipients],
    enabled: rule.enabled,
    enabledAfter: rule.enabledAfter,
    delegationId: rule.delegationId,
    delegate: rule.delegate,
    delegateVersion: rule.delegateVersion,
  };
}
export function projectActionRunDto(run: ProjectActionRun): ProjectActionRunDto {
  return {
    id: run.id,
    projectId: run.projectId,
    rule: projectActionRuleDto(run.rule),
    revisionId: run.revisionId,
    baselineId: run.baselineId,
    status: run.status,
    version: run.version,
    step: run.step,
    attempt: run.attempt,
    due: run.due,
    createdAt: run.createdAt,
    results: run.results.map((result) => ({
      step: result.step,
      value: structuredClone(result.value),
    })),
  };
}
export function projectActionReceiptDto(record: ProjectActionRecord): ProjectActionReceipt {
  return "rule" in record
    ? { rule: projectActionRuleDto(record.rule) }
    : { run: projectActionRunDto(record.run) };
}
