export class ProjectActionsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ProjectActionKind = "check-wbs-revision" | "notify-wbs-baseline";
export type ProjectActionRule = Readonly<{
  id: string;
  projectId: string;
  version: number;
  kind: ProjectActionKind;
  recipients: readonly string[];
  enabled: boolean;
  enabledAfter: number;
  delegationId: string;
  delegate: string;
  delegateVersion: number;
}>;
export type ProjectActionRun = Readonly<{
  id: string;
  projectId: string;
  rule: ProjectActionRule;
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
export type ProjectActionScope = {
  role: "READ" | "WRITE" | "ADMIN";
  closed: boolean;
  transferRequested: boolean;
  qualificationVersion: number;
};
export function requireProjectActionAccess(scope: ProjectActionScope) {
  if (scope.role !== "ADMIN") throw new ProjectActionsError(403, "目前不能管理或執行自動化。");
}
export function requireProjectActionManager(scope: ProjectActionScope) {
  requireProjectActionAccess(scope);
  if (scope.closed) throw new ProjectActionsError(409, "Project 已關閉。");
  if (scope.transferRequested) throw new ProjectActionsError(409, "Project WBS 正在移轉。");
}
export function ruleDefinition(kind: ProjectActionKind, recipients: readonly string[]) {
  const unique = [...new Set(recipients)].sort();
  if (unique.length > 100 || unique.some((id) => !id || id.length > 128))
    throw new ProjectActionsError(400, "接收者名單不正確。");
  if (
    (kind === "check-wbs-revision" && unique.length !== 0) ||
    (kind === "notify-wbs-baseline" && unique.length === 0)
  )
    throw new ProjectActionsError(400, "固定流程與接收者名單不一致。");
  return unique;
}
export function changeProjectActionRule(
  current: ProjectActionRule | null,
  input: {
    id: string;
    projectId: string;
    expectedVersion: number;
    kind: ProjectActionKind;
    recipients: readonly string[];
    enabled: boolean;
  },
  actor: string,
  qualificationVersion: number,
  cursor: number,
  delegationId: string,
): ProjectActionRule {
  if ((current?.version ?? 0) !== input.expectedVersion)
    throw new ProjectActionsError(409, "規則版本衝突。");
  if (current && current.kind !== input.kind)
    throw new ProjectActionsError(409, "請為不同固定流程建立另一規則。");
  const enabling =
    input.enabled &&
    (!current?.enabled ||
      current.delegate !== actor ||
      current.delegateVersion !== qualificationVersion);
  return {
    id: input.id,
    projectId: input.projectId,
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
  run: ProjectActionRun,
  rule: ProjectActionRule | null,
  scope: ProjectActionScope | null,
) {
  return Boolean(
    rule?.enabled &&
      scope &&
      !scope.closed &&
      !scope.transferRequested &&
      rule.delegationId === run.rule.delegationId &&
      scope.qualificationVersion === run.rule.delegateVersion &&
      scope.role === "ADMIN",
  );
}
export function cancelProjectActionRun(
  run: ProjectActionRun,
  expectedVersion: number,
): ProjectActionRun {
  requireRunVersion(run, expectedVersion);
  if (run.status === "succeeded") throw new ProjectActionsError(409, "已完成的效果不可取消。");
  return { ...run, status: "cancelled", version: run.version + 1 };
}
export function retryProjectActionRun(
  run: ProjectActionRun,
  expectedVersion: number,
  now: number,
): ProjectActionRun {
  requireRunVersion(run, expectedVersion);
  if (!["failed", "waiting"].includes(run.status))
    throw new ProjectActionsError(409, "此執行目前不能重試。");
  return { ...run, status: "queued", due: now, version: run.version + 1 };
}

function requireRunVersion(run: ProjectActionRun, expectedVersion: number) {
  if (run.version !== expectedVersion) throw new ProjectActionsError(409, "執行版本衝突。");
}
export function requireRuleCapacity(count: number) {
  if (count >= 100) throw new ProjectActionsError(409, "Project 規則上限為 100。");
}
function queuedRun(
  rule: ProjectActionRule,
  source: { projectId: string; revisionId: string; baselineId: string | null },
  id: string,
  now: number,
): ProjectActionRun {
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
export function startManualProjectActionRun(
  rule: ProjectActionRule | null,
  input: {
    id: string;
    projectId: string;
    revisionId: string;
    expectedVersion: number;
    actor: string;
    qualificationVersion: number;
    now: number;
  },
): ProjectActionRun {
  if (!rule || !rule.enabled || rule.kind !== "check-wbs-revision")
    throw new ProjectActionsError(409, "規則不適用於手動執行。");
  if (rule.version !== input.expectedVersion) throw new ProjectActionsError(409, "規則版本衝突。");
  return queuedRun(
    { ...rule, delegate: input.actor, delegateVersion: input.qualificationVersion },
    { projectId: input.projectId, revisionId: input.revisionId, baselineId: null },
    input.id,
    input.now,
  );
}
function acceptsBaselineEvent(rule: ProjectActionRule, cursor: number): boolean {
  return rule.enabled && rule.kind === "notify-wbs-baseline" && cursor > rule.enabledAfter;
}
export function startProjectBaselineActionRun(
  rule: ProjectActionRule,
  source: { projectId: string; revisionId: string; baselineId: string; cursor: number },
  id: string,
  now: number,
): ProjectActionRun | null {
  if (!acceptsBaselineEvent(rule, source.cursor)) return null;
  return queuedRun(
    rule,
    {
      projectId: source.projectId,
      revisionId: source.revisionId,
      baselineId: source.baselineId,
    },
    id,
    now,
  );
}
export type ProjectActionStepOutcome =
  | { kind: "delegation-unavailable" | "source-or-delivery-unavailable" }
  | { kind: "checked"; value: unknown }
  | { kind: "notified"; value: unknown; nextAt: number | null };
export function finishProjectActionStep(
  run: ProjectActionRun,
  outcome: ProjectActionStepOutcome,
  now: number,
): ProjectActionRun {
  if (run.status !== "running") throw new ProjectActionsError(409, "執行目前沒有有效步驟。");
  let status: ProjectActionRun["status"] = "failed",
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
