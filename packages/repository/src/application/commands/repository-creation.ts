import { isRecord } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../../contracts/errors/repository-error.js";
import type { RepositoryCreateCommand } from "../../contracts/input/repository-creation.js";
import { normalizeRepositoryName } from "../../domain/repository/value-objects/repository-name.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function parseRepositoryCreateCommand(raw: unknown): RepositoryCreateCommand {
  if (!isRecord(raw)) {
    throw new RepositoryError(400, "Repository 建立資料格式不正確。");
  }
  const value = raw;
  const allowed = ["requestId", "ownerAccountId", "ownerKind", "name", "visibility"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RepositoryError(400, "Repository 建立資料包含不支援的欄位。");
  }
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new RepositoryError(400, "Repository 建立請求編號不正確。");
  }
  if (value.ownerKind !== "USER" && value.ownerKind !== "ORGANIZATION") {
    throw new RepositoryError(400, "Repository owner 類型不正確。");
  }
  if (
    typeof value.ownerAccountId !== "string" ||
    value.ownerAccountId !== value.ownerAccountId.trim() ||
    value.ownerAccountId.length < 1 ||
    value.ownerAccountId.length > 128
  ) {
    throw new RepositoryError(400, "Repository owner 不正確。");
  }
  if (typeof value.name !== "string") {
    throw new RepositoryError(400, "Repository name 不正確。");
  }
  const name = normalizeRepositoryName(value.name);
  if (!name) throw new RepositoryError(400, "Repository name 不正確。");
  const visibility = value.visibility ?? "private";
  if (visibility !== "private" && visibility !== "internal" && visibility !== "public") {
    throw new RepositoryError(400, "Repository visibility 不正確。");
  }
  return {
    requestId: value.requestId.toLowerCase(),
    ownerAccountId: value.ownerAccountId,
    ownerKind: value.ownerKind,
    name,
    visibility,
  };
}
