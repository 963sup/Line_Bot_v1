/**
 * LINE 身分經後端核驗並明確註冊後成為 active；Google 關聯為選填。
 * paused 表示使用者主動暫停，可由原 LINE 身分明確恢復；關聯資料與 Asset history 保留。
 * suspended 表示管理停權，註冊、恢復或 Google 關聯均不得繞過。
 */
export type UserStatus = "paused" | "active" | "suspended";
export type User = { id: string; status: UserStatus; createdAt: number };

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

export function parseUserStatusCommand(raw: unknown): UserStatusCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new UserError(400, "使用者操作格式不正確。");
  const v = raw as Record<string, unknown>;
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
