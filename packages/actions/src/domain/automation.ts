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
export function cancelActionRun(run: ActionRun): ActionRun {
  if (run.status === "succeeded") throw new ActionsError(409, "已完成的效果不可取消。");
  return { ...run, status: "cancelled", version: run.version + 1 };
}
export function retryActionRun(run: ActionRun, now: number): ActionRun {
  if (!["failed", "waiting"].includes(run.status))
    throw new ActionsError(409, "此執行目前不能重試。");
  return { ...run, status: "queued", due: now, version: run.version + 1 };
}
