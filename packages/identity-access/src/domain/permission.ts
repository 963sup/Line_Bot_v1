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
  "workplaces.manage": "工作地點管理",
  "partners.manage": "合作夥伴管理",
  "partners.review": "推薦審核",
} as const;
export type Permission = keyof typeof permissions;
export type PermissionCommand = {
  requestId: string;
  target: string;
  permission: Permission;
  workplaceId: string | null;
  enabled: boolean;
  expectedVersion: number;
  reason: string;
};
export function parsePermissionCommand(raw: unknown): PermissionCommand {
  const c = raw as Partial<PermissionCommand> | null;
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    !c ||
    typeof c !== "object" ||
    Array.isArray(c) ||
    Object.keys(c).some(
      (k) =>
        ![
          "requestId",
          "target",
          "permission",
          "workplaceId",
          "enabled",
          "expectedVersion",
          "reason",
        ].includes(k),
    ) ||
    typeof c.requestId !== "string" ||
    !uuid.test(c.requestId) ||
    typeof c.target !== "string" ||
    !c.target.trim() ||
    c.target.length > 128 ||
    typeof c.permission !== "string" ||
    !Object.hasOwn(permissions, c.permission) ||
    !(
      c.workplaceId === null ||
      (c.permission === "workplaces.manage" &&
        typeof c.workplaceId === "string" &&
        uuid.test(c.workplaceId))
    ) ||
    typeof c.enabled !== "boolean" ||
    !Number.isSafeInteger(c.expectedVersion) ||
    c.expectedVersion! < 0 ||
    typeof c.reason !== "string" ||
    !c.reason.trim() ||
    c.reason.length > 500
  )
    throw new PermissionError(400, "權限設定不正確，請核對使用者、功能、範圍與原因。");
  return { ...c, reason: c.reason.trim() } as PermissionCommand;
}
