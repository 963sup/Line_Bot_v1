import type { IssueTypeColor, IssueTypeCommand, IssueTypeStore } from "../contracts/issue-types.js";
import { IssueError } from "../domain.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const colors: readonly IssueTypeColor[] = [
  "BLUE",
  "GRAY",
  "GREEN",
  "ORANGE",
  "PINK",
  "PURPLE",
  "RED",
  "YELLOW",
];

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IssueError(400, "IssueType 操作格式不正確。");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new IssueError(400, "IssueType 操作含有未知欄位。");
  }
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 120) {
    throw new IssueError(400, `${label} 不正確。`);
  }
  return value;
}

function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new IssueError(400, "IssueType 版本不正確。");
  }
  return Number(value);
}

function name(value: unknown): string {
  if (typeof value !== "string") throw new IssueError(400, "IssueType 名稱格式不正確。");
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    throw new IssueError(400, "IssueType 名稱需為 1 到 120 字。");
  }
  return normalized;
}

function description(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new IssueError(400, "IssueType 說明格式不正確。");
  const normalized = value.trim();
  if (normalized.length > 2_000) {
    throw new IssueError(400, "IssueType 說明不可超過 2000 字。");
  }
  return normalized || null;
}

function color(value: unknown): IssueTypeColor {
  if (!colors.includes(value as IssueTypeColor)) {
    throw new IssueError(400, "IssueType 顏色不正確。");
  }
  return value as IssueTypeColor;
}

function enabled(value: unknown): boolean {
  if (typeof value !== "boolean") throw new IssueError(400, "IssueType enabled 狀態不正確。");
  return value;
}

function base(value: Record<string, unknown>) {
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new IssueError(400, "請求編號不正確。");
  }
  return {
    requestId: value.requestId.toLowerCase(),
    organizationAccountId: identifier(value.organizationAccountId, "Organization 識別碼"),
  };
}

function parseCommand(raw: unknown): IssueTypeCommand {
  const value = objectInput(raw);
  const common = base(value);

  if (value.action === "create-issue-type") {
    exactKeys(value, [
      "action",
      "requestId",
      "organizationAccountId",
      "name",
      "description",
      "color",
      "isEnabled",
    ]);
    return {
      ...common,
      action: value.action,
      name: name(value.name),
      description: description(value.description),
      color: color(value.color),
      isEnabled: enabled(value.isEnabled),
    };
  }

  if (value.action === "update-issue-type") {
    exactKeys(value, [
      "action",
      "requestId",
      "organizationAccountId",
      "issueTypeId",
      "expectedVersion",
      "name",
      "description",
      "color",
      "isEnabled",
    ]);
    const patch = {
      name: value.name === undefined ? undefined : name(value.name),
      description: value.description === undefined ? undefined : description(value.description),
      color: value.color === undefined ? undefined : color(value.color),
      isEnabled: value.isEnabled === undefined ? undefined : enabled(value.isEnabled),
    };
    if (Object.values(patch).every((item) => item === undefined)) {
      throw new IssueError(400, "IssueType 更新至少需要一個欄位。");
    }
    return {
      ...common,
      action: value.action,
      issueTypeId: identifier(value.issueTypeId, "IssueType 識別碼"),
      expectedVersion: expectedVersion(value.expectedVersion),
      ...patch,
    };
  }

  if (value.action === "delete-issue-type") {
    exactKeys(value, [
      "action",
      "requestId",
      "organizationAccountId",
      "issueTypeId",
      "expectedVersion",
    ]);
    return {
      ...common,
      action: value.action,
      issueTypeId: identifier(value.issueTypeId, "IssueType 識別碼"),
      expectedVersion: expectedVersion(value.expectedVersion),
    };
  }

  throw new IssueError(400, "IssueType 操作不正確。");
}

export function createIssueTypes(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): IssueTypeStore;
  now(): number;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }

  return {
    list: async (subject: string, organizationAccountId: string) =>
      deps
        .store()
        .list(await identity(subject), identifier(organizationAccountId, "Organization 識別碼")),
    command: async (subject: string, raw: unknown) =>
      deps.store().execute(await identity(subject), parseCommand(raw), deps.now()),
  };
}
