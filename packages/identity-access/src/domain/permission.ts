export class PermissionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

export const permissions = {
  "users.read": "使用者查詢",
  "users.suspend": "使用者停權與解除",
  "partners.manage": "合作夥伴管理",
  "partners.review": "推薦審核",
} as const;
export type Permission = keyof typeof permissions;

export function assertPermissionAdministratorDeactivation(
  targetEffective: boolean,
  anotherEffective: boolean,
) {
  if (targetEffective && !anotherEffective)
    throw new PermissionError(409, "不能停用最後一位有效權限管理員，請先指定另一位管理員。");
}
export function assertPermissionChangeActor<T extends { target: string }>(
  actor: string,
  change: T,
  canManage: boolean,
) {
  if (!canManage) throw new PermissionError(403, "沒有權限管理資格。");
  if (actor === change.target)
    throw new PermissionError(403, "不能修改自己的業務權限，請由另一位權限管理員處理。");
}

export function assertPermissionChangeState<
  T extends { enabled: boolean; expectedVersion: number },
>(change: T, version: number, targetActive: boolean) {
  if (version !== change.expectedVersion)
    throw new PermissionError(409, "權限已更新，請重新讀取後確認。");
  if (change.enabled && !targetActive) throw new PermissionError(409, "只能授權有效使用者。");
}

export function assertPermissionDependencies<
  T extends { permission: Permission; enabled: boolean },
>(change: T, facts: { canReadUsers: boolean; hasSuspendGrant: boolean }) {
  if (change.enabled && change.permission === "users.suspend" && !facts.canReadUsers)
    throw new PermissionError(409, "請先授予使用者查詢權限。");
  if (!change.enabled && change.permission === "users.read" && facts.hasSuspendGrant)
    throw new PermissionError(409, "請先撤銷使用者停權權限。");
}
