/**
 * LINE 身分經後端核驗並明確註冊後成為 active；Google 關聯為選填。
 * paused 表示使用者主動暫停，可由原 LINE 身分明確恢復；關聯資料與 Asset history 保留。
 * suspended 表示管理停權，註冊、恢復或 Google 關聯均不得繞過。
 */
export type UserStatus = "paused" | "active" | "suspended";
export type User = { id: string; status: UserStatus; createdAt: number };

export function assertUserFollowTarget(
  actor: string,
  target: string,
  action: "follow" | "unfollow",
) {
  if (actor === target)
    throw new UserError(400, action === "follow" ? "不能追蹤自己。" : "不能取消追蹤自己。");
}

export function requireFollowableUser(user: User | null) {
  if (!user || user.status !== "active") throw new UserError(404, "找不到可追蹤的使用者。");
}

export function registerUser(id: string, at: number) {
  return { user: { id, status: "active" as const, createdAt: at }, event: "registered" };
}

export function decideLineUser(
  operation: "register" | "restore",
  user: User | null,
):
  | { kind: "create" }
  | { kind: "confirm" | "read"; user: User }
  | { kind: "restore"; user: User; event: string } {
  if (!user) {
    if (operation === "restore") throw new UserError(404, "會員尚未註冊。");
    return { kind: "create" };
  }
  if (user.status === "suspended") throw new UserError(403, "會員已停權。");
  if (operation === "register") return { kind: "confirm", user };
  return user.status === "active"
    ? { kind: "read", user }
    : { kind: "restore", user: { ...user, status: "active" }, event: "membership_resumed" };
}

export function confirmUserRegistration(user: User, login: string, currentLogin: string | null) {
  if (currentLogin && currentLogin !== login)
    throw new UserError(409, "此 User 已使用其他登入名稱。");
  if (!currentLogin) throw new UserError(500, "User 登入名稱資料不完整。");
  if (user.status !== "active") throw new UserError(409, "會員已存在，請使用恢復功能。");
}

export function requireRegisteredLineUser(user: User | null) {
  if (!user) throw new UserError(403, "請使用已註冊的 LINE 會員。");
  if (user.status === "suspended") throw new UserError(403, "會員已停權。");
  return user;
}

export function assertExistingGoogleBinding(
  authId: string | null,
  subject: string | null,
  nextAuthId: string,
  nextSubject: string,
) {
  if ((authId && authId !== nextAuthId) || (subject && subject !== nextSubject))
    throw new UserError(409, "此 LINE 已綁定其他 Google 帳號，請使用原帳號登入。");
}

export function decideGoogleUserBinding(
  user: User,
  authId: string | null,
  nextAuthId: string,
  otherUserId: string | null,
) {
  if (otherUserId && otherUserId !== user.id)
    throw new UserError(409, "此 Google 帳號已綁定其他 LINE 會員。");
  return {
    user: { ...user, status: "active" as const },
    event: authId !== nextAuthId || user.status !== "active" ? "supabase_linked" : null,
  };
}

export function assertUserLoginChange(user: User) {
  if (user.status !== "active") throw new UserError(403, "目前會員資格無法更新登入名稱。");
}

export function pauseUser(user: User) {
  return {
    user: { ...requireActiveUser(user), status: "paused" as const },
    event: "membership_deactivated",
  };
}

export function suspendUser(user: User) {
  return { user: { ...user, status: "suspended" as const }, event: "suspended" };
}

export class UserError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type UserStatusCommand = {
  action: "suspend" | "unsuspend";
  requestId: string;
  target: string;
  expectedVersion: number;
  reason: string;
};

export type UserManagementState = {
  status: UserStatus;
  version: number;
  restoreStatus: "active" | "paused";
};

export function requireUserManagementPermissions(
  facts: { canRead: boolean; canSuspend: boolean },
  write = false,
) {
  if (!facts.canRead || (write && !facts.canSuspend))
    throw new UserError(403, "你沒有此操作的使用者管理權限。");
  return facts.canSuspend;
}

export function assertUserManagementTarget(actor: string, target: string) {
  if (actor === target) throw new UserError(403, "不能從此頁停權或解除自己的帳號。");
}

export function decideUserStatusChange(
  command: UserStatusCommand,
  target: UserManagementState,
): { status: UserStatus; event: "suspended" | "suspension_lifted" } {
  if (target.version !== command.expectedVersion)
    throw new UserError(409, "使用者狀態已更新，請重新讀取後確認。");
  if ((command.action === "suspend") === (target.status === "suspended"))
    throw new UserError(409, "使用者目前狀態不適用此操作。");
  return command.action === "suspend"
    ? { status: "suspended", event: "suspended" }
    : { status: target.restoreStatus, event: "suspension_lifted" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseUserStatusCommand(raw: unknown): UserStatusCommand {
  if (!isRecord(raw)) throw new UserError(400, "使用者操作格式不正確。");
  const v = raw;
  if (
    Object.keys(v).some(
      (key) => !["action", "requestId", "target", "expectedVersion", "reason"].includes(key),
    ) ||
    (v.action !== "suspend" && v.action !== "unsuspend") ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.requestId) ||
    typeof v.target !== "string" ||
    !/^[\w-]{1,128}$/.test(v.target) ||
    typeof v.expectedVersion !== "number" ||
    !Number.isSafeInteger(v.expectedVersion) ||
    v.expectedVersion < 1 ||
    typeof v.reason !== "string" ||
    !v.reason.trim() ||
    v.reason.trim().length > 500
  )
    throw new UserError(400, "請核對使用者、版本與操作原因。");
  return {
    action: v.action,
    requestId: v.requestId.toLowerCase(),
    target: v.target,
    expectedVersion: v.expectedVersion,
    reason: v.reason.trim(),
  };
}

/**
 * 第一性守衛：主動要求有效會員 (Guard Function)
 *
 * 邏輯推導：
 * 任何受保護的操作（如記帳、AI 代理任務、資料調取）必須通過此純函數斷言。
 * - 若會員不存在或狀態非 active，立即拋出 403 異常中斷流程。
 * - 區分管理停權與需要註冊／恢復的狀態；Google 關聯不作資格條件。
 */
export function requireActiveUser(account: User | null): User {
  if (!account || account.status !== "active") {
    throw new UserError(
      403,
      account?.status === "suspended" ? "使用者已停權。" : "請先完成使用者註冊或恢復使用者資格。",
    );
  }
  return account;
}
