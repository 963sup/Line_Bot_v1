import {
  normalizeRepositoryStarListDescription,
  normalizeRepositoryStarListName,
  RepositoryError,
} from "../domain.js";
import type {
  RepositoryStarListCommand,
  RepositoryStarListCreateCommand,
  RepositoryStarListStore,
} from "./ports/star-lists.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function requestId(value: unknown): string {
  if (typeof value !== "string" || !requestIdPattern.test(value)) {
    throw new RepositoryError(400, "List 請求編號不正確。");
  }
  return value.toLowerCase();
}

function listId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > 120
  ) {
    throw new RepositoryError(400, "List 識別碼不正確。");
  }
  return value;
}

function repositoryId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > 120
  ) {
    throw new RepositoryError(400, "Repository 識別碼不正確。");
  }
  return value;
}

function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new RepositoryError(400, "List version 不正確。");
  }
  return Number(value);
}

function parseCreate(raw: unknown): RepositoryStarListCreateCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "List 建立資料格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["requestId", "name", "description"].includes(key))) {
    throw new RepositoryError(400, "List 建立資料包含不支援的欄位。");
  }
  const name = normalizeRepositoryStarListName(value.name);
  const description = normalizeRepositoryStarListDescription(value.description ?? "");
  if (!name || description === null) {
    throw new RepositoryError(400, "List 名稱或描述不正確。");
  }
  return { requestId: requestId(value.requestId), name, description };
}

function parseCommand(targetListId: string, raw: unknown): RepositoryStarListCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "List 操作資料格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  const action = value.action;
  const base = {
    requestId: requestId(value.requestId),
    listId: listId(targetListId),
    expectedVersion: expectedVersion(value.expectedVersion),
  };

  if (action === "update") {
    if (
      Object.keys(value).some(
        (key) => !["requestId", "action", "expectedVersion", "name", "description"].includes(key),
      )
    ) {
      throw new RepositoryError(400, "List 更新資料包含不支援的欄位。");
    }
    const name = normalizeRepositoryStarListName(value.name);
    const description = normalizeRepositoryStarListDescription(value.description ?? "");
    if (!name || description === null) {
      throw new RepositoryError(400, "List 名稱或描述不正確。");
    }
    return { ...base, action, name, description };
  }

  if (action === "add" || action === "remove") {
    if (
      Object.keys(value).some(
        (key) => !["requestId", "action", "expectedVersion", "repositoryId"].includes(key),
      )
    ) {
      throw new RepositoryError(400, "List Repository 操作包含不支援的欄位。");
    }
    return { ...base, action, repositoryId: repositoryId(value.repositoryId) };
  }

  if (action === "publish" || action === "unpublish" || action === "delete") {
    if (
      Object.keys(value).some(
        (key) => !["requestId", "action", "expectedVersion"].includes(key),
      )
    ) {
      throw new RepositoryError(400, "List 操作包含不支援的欄位。");
    }
    return { ...base, action };
  }
  throw new RepositoryError(400, "不支援的 List 操作。");
}

export function createRepositoryStarLists(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryStarListStore;
  now(): number;
}) {
  async function userId(subject: string) {
    return (await deps.activeUser(subject)).id;
  }

  return {
    mine: async (subject: string) => deps.store().mine(await userId(subject)),
    detail: async (subject: string, targetListId: string) =>
      deps.store().detail(await userId(subject), listId(targetListId)),
    create: async (subject: string, raw: unknown) =>
      deps.store().create(await userId(subject), parseCreate(raw), deps.now()),
    command: async (subject: string, targetListId: string, raw: unknown) =>
      deps.store().execute(await userId(subject), parseCommand(targetListId, raw), deps.now()),
  };
}
