export class ActionsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ActionKind = "check-wbs-revision" | "notify-wbs-baseline";
export type ActionRule = Readonly<{
  id: string;
  repositoryId: string;
  version: number;
  kind: ActionKind;
  recipients: readonly string[];
  enabled: boolean;
  enabledAfter: number;
  delegationId: string;
  delegate: string;
  delegateVersion: number;
}>;
export type ActionRun = Readonly<{
  id: string;
  repositoryId: string;
  rule: ActionRule;
  revisionId: string;
  baselineId: string | null;
  status: "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
  version: number;
  step: number;
  attempt: number;
  due: number;
  createdAt: number;
  results: readonly Readonly<{ step: number; value: unknown }>[];
}>;
export type ActionScope = {
  permissions: readonly string[];
  archived: boolean;
  qualificationVersion: number;
};
export function requireActionAccess(scope: ActionScope) {
  if (!scope.permissions.some((p) => p === "maintain" || p === "admin"))
    throw new ActionsError(403, "目前不能管理或執行自動化。");
}
export function requireActionManager(scope: ActionScope) {
  requireActionAccess(scope);
  if (scope.archived) throw new ActionsError(409, "Repository 已封存。");
}
export function ruleDefinition(kind: ActionKind, recipients: readonly string[]) {
  const unique = [...new Set(recipients)].sort();
  if (unique.length > 100 || unique.some((id) => !id || id.length > 128))
    throw new ActionsError(400, "接收者名單不正確。");
  if (
    (kind === "check-wbs-revision" && unique.length !== 0) ||
    (kind === "notify-wbs-baseline" && unique.length === 0)
  )
    throw new ActionsError(400, "固定流程與接收者名單不一致。");
  return unique;
}
export function changeActionRule(
  current: ActionRule | null,
  input: {
    id: string;
    repositoryId: string;
    expectedVersion: number;
    kind: ActionKind;
    recipients: readonly string[];
    enabled: boolean;
  },
  actor: string,
  qualificationVersion: number,
  cursor: number,
  delegationId: string,
): ActionRule {
  if ((current?.version ?? 0) !== input.expectedVersion)
    throw new ActionsError(409, "規則版本衝突。");
  if (current && current.kind !== input.kind)
    throw new ActionsError(409, "請為不同固定流程建立另一規則。");
  const enabling =
    input.enabled &&
    (!current?.enabled ||
      current.delegate !== actor ||
      current.delegateVersion !== qualificationVersion);
  return {
    id: input.id,
    repositoryId: input.repositoryId,
    version: input.expectedVersion + 1,
    kind: input.kind,
    recipients: ruleDefinition(input.kind, input.recipients),
    enabled: input.enabled,
    enabledAfter: enabling ? cursor : (current?.enabledAfter ?? cursor),
    delegationId: enabling ? delegationId : (current?.delegationId ?? delegationId),
    delegate: enabling ? actor : (current?.delegate ?? actor),
    delegateVersion: enabling
      ? qualificationVersion
      : (current?.delegateVersion ?? qualificationVersion),
  };
}
export function executionAllowed(
  run: ActionRun,
  rule: ActionRule | null,
  scope: ActionScope | null,
) {
  return Boolean(
    rule?.enabled &&
      scope &&
      !scope.archived &&
      rule.delegationId === run.rule.delegationId &&
      scope.qualificationVersion === run.rule.delegateVersion &&
      scope.permissions.some((p) => p === "maintain" || p === "admin"),
  );
}
export function cancelActionRun(run: ActionRun, expectedVersion: number): ActionRun {
  requireRunVersion(run, expectedVersion);
  if (run.status === "succeeded") throw new ActionsError(409, "已完成的效果不可取消。");
  return { ...run, status: "cancelled", version: run.version + 1 };
}
export function retryActionRun(run: ActionRun, expectedVersion: number, now: number): ActionRun {
  requireRunVersion(run, expectedVersion);
  if (!["failed", "waiting"].includes(run.status))
    throw new ActionsError(409, "此執行目前不能重試。");
  return { ...run, status: "queued", due: now, version: run.version + 1 };
}

function requireRunVersion(run: ActionRun, expectedVersion: number) {
  if (run.version !== expectedVersion) throw new ActionsError(409, "執行版本衝突。");
}
export function requireRuleCapacity(count: number) {
  if (count >= 100) throw new ActionsError(409, "Repository 規則上限為 100。");
}
function queuedRun(
  rule: ActionRule,
  source: { repositoryId: string; revisionId: string; baselineId: string | null },
  id: string,
  now: number,
): ActionRun {
  return {
    id,
    ...source,
    rule,
    status: "queued",
    version: 1,
    step: 0,
    attempt: 0,
    due: now,
    createdAt: now,
    results: [],
  };
}
export function startManualActionRun(
  rule: ActionRule | null,
  input: {
    id: string;
    repositoryId: string;
    revisionId: string;
    expectedVersion: number;
    actor: string;
    qualificationVersion: number;
    now: number;
  },
): ActionRun {
  if (!rule || !rule.enabled || rule.kind !== "check-wbs-revision")
    throw new ActionsError(409, "規則不適用於手動執行。");
  if (rule.version !== input.expectedVersion) throw new ActionsError(409, "規則版本衝突。");
  return queuedRun(
    { ...rule, delegate: input.actor, delegateVersion: input.qualificationVersion },
    { repositoryId: input.repositoryId, revisionId: input.revisionId, baselineId: null },
    input.id,
    input.now,
  );
}
function acceptsBaselineEvent(rule: ActionRule, cursor: number): boolean {
  return rule.enabled && rule.kind === "notify-wbs-baseline" && cursor > rule.enabledAfter;
}
export function startBaselineActionRun(
  rule: ActionRule,
  source: { repositoryId: string; revisionId: string; baselineId: string; cursor: number },
  id: string,
  now: number,
): ActionRun | null {
  if (!acceptsBaselineEvent(rule, source.cursor)) return null;
  return queuedRun(
    rule,
    {
      repositoryId: source.repositoryId,
      revisionId: source.revisionId,
      baselineId: source.baselineId,
    },
    id,
    now,
  );
}
export type ActionStepOutcome =
  | { kind: "delegation-unavailable" | "source-or-delivery-unavailable" }
  | { kind: "checked"; value: unknown }
  | { kind: "notified"; value: unknown; nextAt: number | null };
export function finishActionStep(
  run: ActionRun,
  outcome: ActionStepOutcome,
  now: number,
): ActionRun {
  if (run.status !== "running") throw new ActionsError(409, "執行目前沒有有效步驟。");
  let status: ActionRun["status"] = "failed",
    advance = false,
    due = now,
    value: unknown;
  if (outcome.kind === "checked") {
    status = "succeeded";
    advance = true;
    value = outcome.value;
  } else if (outcome.kind === "notified") {
    value = outcome.value;
    if (outcome.nextAt !== null) {
      status = "waiting";
      due = outcome.nextAt;
    } else {
      status = run.step + 1 < run.rule.recipients.length ? "queued" : "succeeded";
      advance = true;
    }
  } else value = { reason: outcome.kind };
  return {
    ...run,
    status,
    version: run.version + 1,
    step: run.step + (advance ? 1 : 0),
    due,
    results: [
      ...run.results.filter((result) => result.step !== run.step),
      { step: run.step, value },
    ],
  };
}
