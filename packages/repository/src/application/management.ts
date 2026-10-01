import type { RepositorySelector } from "../contracts/selectors.js";
import {
  normalizeRepositoryName,
  RepositoryError,
  type RepositoryVisibility,
} from "../domain.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";
import type {
  RepositoryManagementCommand,
  RepositoryManagementStore,
} from "./ports/management.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;
const visibilities = new Set<RepositoryVisibility>(["private", "internal", "public"]);

function repositorySelector(value: RepositorySelector): RepositorySelector {
  if ("repositoryId" in value) {
    if (!identifierPattern.test(value.repositoryId)) {
      throw new RepositoryError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const ownerLogin = accountLoginForRepositoryLocator(value.ownerLogin);
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!ownerLogin || !repositoryName) {
    throw new RepositoryError(400, "Repository 路徑不正確。");
  }
  return { ownerLogin, repositoryName };
}

function parseCommand(raw: unknown): RepositoryManagementCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "Repository 管理操作格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  if (
    value.action !== "rename" &&
    value.action !== "visibility" &&
    value.action !== "archive" &&
    value.action !== "unarchive"
  ) {
    throw new RepositoryError(400, "Repository 管理動作不正確。");
  }
  const allowed =
    value.action === "rename"
      ? ["action", "requestId", "repositoryId", "expectedVersion", "name"]
      : value.action === "visibility"
        ? ["action", "requestId", "repositoryId", "expectedVersion", "visibility"]
        : ["action", "requestId", "repositoryId", "expectedVersion"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RepositoryError(400, "Repository 管理操作包含不支援的欄位。");
  }
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new RepositoryError(400, "Repository 管理請求編號不正確。");
  }
  if (typeof value.repositoryId !== "string" || !identifierPattern.test(value.repositoryId)) {
    throw new RepositoryError(400, "Repository 識別碼不正確。");
  }
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  ) {
    throw new RepositoryError(400, "Repository 版本不正確。");
  }
  const base = {
    action: value.action,
    requestId: value.requestId.toLowerCase(),
    repositoryId: value.repositoryId,
    expectedVersion: value.expectedVersion,
  } as const;
  if (value.action === "rename") {
    if (typeof value.name !== "string") {
      throw new RepositoryError(400, "Repository name 不正確。");
    }
    const name = normalizeRepositoryName(value.name);
    if (!name) throw new RepositoryError(400, "Repository name 不正確。");
    return { ...base, action: "rename", name };
  }
  if (value.action === "visibility") {
    if (
      typeof value.visibility !== "string" ||
      !visibilities.has(value.visibility as RepositoryVisibility)
    ) {
      throw new RepositoryError(400, "Repository visibility 不正確。");
    }
    return {
      ...base,
      action: "visibility",
      visibility: value.visibility as RepositoryVisibility,
    };
  }
  return { ...base, action: value.action };
}

export function createRepositoryManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryManagementStore;
  now(): number;
}) {
  return {
    async view(subject: string, selector: RepositorySelector) {
      const user = await deps.activeUser(subject);
      return deps.store().view(user.id, repositorySelector(selector));
    },
    async execute(subject: string, raw: unknown) {
      const command = parseCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().execute(user.id, command, deps.now());
    },
  };
}
