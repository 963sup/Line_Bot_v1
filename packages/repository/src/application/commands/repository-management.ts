import { isRecord } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../../contracts/errors/repository-error.js";
import type { RepositoryManagementCommand } from "../../contracts/input/repository-management.js";
import type { RepositorySelector } from "../../contracts/selectors.js";
import type { RepositoryVisibility } from "../../domain/repository/entities/repository.js";
import { normalizeRepositoryName } from "../../domain/repository/value-objects/repository-name.js";
import { accountLoginForRepositoryLocator } from "../owner-locator.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;

function isRepositoryVisibility(value: unknown): value is RepositoryVisibility {
  return value === "private" || value === "internal" || value === "public";
}

export function parseRepositoryManagementSelector(value: RepositorySelector): RepositorySelector {
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
  return {
    ownerLogin,
    repositoryName,
    ...(value.followRenames === false ? { followRenames: false } : {}),
  };
}

export function parseRepositoryManagementCommand(raw: unknown): RepositoryManagementCommand {
  if (!isRecord(raw)) {
    throw new RepositoryError(400, "Repository 管理操作格式不正確。");
  }
  const value = raw;
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
    if (!isRepositoryVisibility(value.visibility)) {
      throw new RepositoryError(400, "Repository visibility 不正確。");
    }
    return { ...base, action: "visibility", visibility: value.visibility };
  }
  return { ...base, action: value.action };
}
