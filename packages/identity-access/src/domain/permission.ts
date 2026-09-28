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
export type PermissionCommand = {
  requestId: string;
  target: string;
  permission: Permission;
  enabled: boolean;
  expectedVersion: number;
  reason: string;
};

export function parsePermissionCommand(raw: unknown): PermissionCommand {
  const command = raw as Partial<PermissionCommand> | null;
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    !command ||
    typeof command !== "object" ||
    Array.isArray(command) ||
    Object.keys(command).some(
      (key) =>
        !["requestId", "target", "permission", "enabled", "expectedVersion", "reason"].includes(
          key,
        ),
    ) ||
    typeof command.requestId !== "string" ||
    !uuid.test(command.requestId) ||
    typeof command.target !== "string" ||
    !command.target.trim() ||
    command.target.length > 128 ||
    typeof command.permission !== "string" ||
    !Object.hasOwn(permissions, command.permission) ||
    typeof command.enabled !== "boolean" ||
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion! < 0 ||
    typeof command.reason !== "string" ||
    !command.reason.trim() ||
    command.reason.length > 500
  ) {
    throw new PermissionError(400, "權限設定不正確，請核對使用者、功能與原因。");
  }
  return { ...command, reason: command.reason.trim() } as PermissionCommand;
}
