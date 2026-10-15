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
export type PermissionCommand = {
  requestId: string;
  target: string;
  permission: Permission;
  enabled: boolean;
  expectedVersion: number;
  reason: string;
};

export function assertPermissionChangeActor(
  actor: string,
  command: PermissionCommand,
  canManage: boolean,
) {
  if (!canManage) throw new PermissionError(403, "沒有權限管理資格。");
  if (actor === command.target)
    throw new PermissionError(403, "不能修改自己的業務權限，請由另一位權限管理員處理。");
}

export function assertPermissionChangeState(
  command: PermissionCommand,
  version: number,
  targetActive: boolean,
) {
  if (version !== command.expectedVersion)
    throw new PermissionError(409, "權限已更新，請重新讀取後確認。");
  if (command.enabled && !targetActive) throw new PermissionError(409, "只能授權有效使用者。");
}

export function assertPermissionDependencies(
  command: PermissionCommand,
  facts: { canReadUsers: boolean; hasSuspendGrant: boolean },
) {
  if (command.enabled && command.permission === "users.suspend" && !facts.canReadUsers)
    throw new PermissionError(409, "請先授予使用者查詢權限。");
  if (!command.enabled && command.permission === "users.read" && facts.hasSuspendGrant)
    throw new PermissionError(409, "請先撤銷使用者停權權限。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && Object.hasOwn(permissions, value);
}

export function parsePermissionCommand(raw: unknown): PermissionCommand {
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    !isRecord(raw) ||
    Object.keys(raw).some(
      (k) =>
        !["requestId", "target", "permission", "enabled", "expectedVersion", "reason"].includes(k),
    ) ||
    typeof raw.requestId !== "string" ||
    !uuid.test(raw.requestId) ||
    typeof raw.target !== "string" ||
    !raw.target.trim() ||
    raw.target.length > 128 ||
    !isPermission(raw.permission) ||
    typeof raw.enabled !== "boolean" ||
    typeof raw.expectedVersion !== "number" ||
    !Number.isSafeInteger(raw.expectedVersion) ||
    raw.expectedVersion < 0 ||
    typeof raw.reason !== "string" ||
    !raw.reason.trim() ||
    raw.reason.length > 500
  )
    throw new PermissionError(400, "權限設定不正確，請核對使用者、功能、範圍與原因。");
  return {
    requestId: raw.requestId,
    target: raw.target,
    permission: raw.permission,
    enabled: raw.enabled,
    expectedVersion: raw.expectedVersion,
    reason: raw.reason.trim(),
  };
}
