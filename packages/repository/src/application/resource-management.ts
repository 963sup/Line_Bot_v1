import { RepositoryError } from "../domain.js";
import type {
  RepositoryResourceManagementCommand,
  RepositoryResourceManagementStore,
} from "./ports/resource-management.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;
const colorPattern = /^[0-9a-fA-F]{6}$/;

const actions = new Set<RepositoryResourceManagementCommand["action"]>([
  "create-label",
  "update-label",
  "delete-label",
  "create-milestone",
  "update-milestone",
  "open-milestone",
  "close-milestone",
]);

function stringField(value: unknown, field: string, maximum: number, trim = false) {
  if (typeof value !== "string") {
    throw new RepositoryError(400, `${field} 不正確。`);
  }
  const normalized = trim ? value.trim() : value;
  if (normalized.length > maximum || (trim && !normalized)) {
    throw new RepositoryError(400, `${field} 不正確。`);
  }
  return normalized;
}

function idField(value: unknown, field: string) {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new RepositoryError(400, `${field} 不正確。`);
  }
  return value;
}

function expectedVersion(value: unknown, create: boolean) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || (!create && Number(value) < 1)) {
    throw new RepositoryError(400, "Repository resource 版本不正確。");
  }
  const version = Number(value);
  if (create && version !== 0) {
    throw new RepositoryError(400, "建立 Repository resource 必須從版本 0 開始。");
  }
  return version;
}

function dueAt(value: unknown) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new RepositoryError(400, "Milestone 到期時間不正確。");
  }
  return Number(value);
}

function base(value: Record<string, unknown>, create: boolean) {
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new RepositoryError(400, "Repository resource 請求編號不正確。");
  }
  return {
    requestId: value.requestId.toLowerCase(),
    repositoryId: idField(value.repositoryId, "Repository 識別碼"),
    expectedVersion: expectedVersion(value.expectedVersion, create),
  };
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RepositoryError(400, "Repository resource 操作包含不支援的欄位。");
  }
}

function parseCommand(raw: unknown): RepositoryResourceManagementCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "Repository resource 操作格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  if (
    typeof value.action !== "string" ||
    !actions.has(value.action as RepositoryResourceManagementCommand["action"])
  ) {
    throw new RepositoryError(400, "Repository resource 動作不正確。");
  }

  if (value.action === "create-label") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "expectedVersion",
      "name",
      "color",
      "description",
    ]);
    const color = stringField(value.color, "Label color", 6);
    if (!colorPattern.test(color)) throw new RepositoryError(400, "Label color 不正確。");
    return {
      ...base(value, true),
      action: "create-label",
      name: stringField(value.name, "Label 名稱", 50, true),
      color: color.toLowerCase(),
      description:
        value.description === undefined ? "" : stringField(value.description, "Label 描述", 500),
    };
  }

  if (value.action === "update-label") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "expectedVersion",
      "labelId",
      "name",
      "color",
      "description",
    ]);
    const command: Extract<RepositoryResourceManagementCommand, { action: "update-label" }> = {
      ...base(value, false),
      action: "update-label",
      labelId: idField(value.labelId, "Label 識別碼"),
    };
    if (value.name !== undefined) command.name = stringField(value.name, "Label 名稱", 50, true);
    if (value.color !== undefined) {
      const color = stringField(value.color, "Label color", 6);
      if (!colorPattern.test(color)) throw new RepositoryError(400, "Label color 不正確。");
      command.color = color.toLowerCase();
    }
    if (value.description !== undefined) {
      command.description = stringField(value.description, "Label 描述", 500);
    }
    if (
      command.name === undefined &&
      command.color === undefined &&
      command.description === undefined
    ) {
      throw new RepositoryError(400, "Label 修改至少需要一個欄位。");
    }
    return command;
  }

  if (value.action === "delete-label") {
    exactKeys(value, ["action", "requestId", "repositoryId", "expectedVersion", "labelId"]);
    return {
      ...base(value, false),
      action: "delete-label",
      labelId: idField(value.labelId, "Label 識別碼"),
    };
  }

  if (value.action === "create-milestone") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "expectedVersion",
      "title",
      "description",
      "dueAt",
    ]);
    return {
      ...base(value, true),
      action: "create-milestone",
      title: stringField(value.title, "Milestone 標題", 160, true),
      description:
        value.description === undefined
          ? ""
          : stringField(value.description, "Milestone 描述", 5000),
      dueAt: value.dueAt === undefined ? null : dueAt(value.dueAt),
    };
  }

  if (value.action === "update-milestone") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "expectedVersion",
      "milestoneId",
      "title",
      "description",
      "dueAt",
    ]);
    const command: Extract<RepositoryResourceManagementCommand, { action: "update-milestone" }> = {
      ...base(value, false),
      action: "update-milestone",
      milestoneId: idField(value.milestoneId, "Milestone 識別碼"),
    };
    if (value.title !== undefined) {
      command.title = stringField(value.title, "Milestone 標題", 160, true);
    }
    if (value.description !== undefined) {
      command.description = stringField(value.description, "Milestone 描述", 5000);
    }
    if (value.dueAt !== undefined) command.dueAt = dueAt(value.dueAt);
    if (
      command.title === undefined &&
      command.description === undefined &&
      command.dueAt === undefined
    ) {
      throw new RepositoryError(400, "Milestone 修改至少需要一個欄位。");
    }
    return command;
  }

  exactKeys(value, ["action", "requestId", "repositoryId", "expectedVersion", "milestoneId"]);
  return {
    ...base(value, false),
    action: value.action,
    milestoneId: idField(value.milestoneId, "Milestone 識別碼"),
  };
}

export function createRepositoryResourceManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryResourceManagementStore;
  now(): number;
}) {
  return {
    async execute(subject: string, raw: unknown) {
      const command = parseCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}
