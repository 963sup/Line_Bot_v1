import type { ActionReceipt, ActionRuleDto, ActionRunDto } from "../../contracts/dto/automation.js";
import type { ActionRecord } from "../../contracts/output/automation.js";
import type { ActionRule, ActionRun } from "../../domain/automation.js";

export function actionRuleDto(rule: ActionRule): ActionRuleDto {
  return {
    id: rule.id,
    repositoryId: rule.repositoryId,
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
export function actionRunDto(run: ActionRun): ActionRunDto {
  return {
    id: run.id,
    repositoryId: run.repositoryId,
    rule: actionRuleDto(run.rule),
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
export function actionReceiptDto(record: ActionRecord): ActionReceipt {
  return "rule" in record
    ? { rule: actionRuleDto(record.rule) }
    : { run: actionRunDto(record.run) };
}
