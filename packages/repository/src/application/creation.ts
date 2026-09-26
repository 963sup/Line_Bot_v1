import { normalizeRepositoryName, RepositoryError } from "../domain.js";
import type {
  RepositoryCreateCommand,
  RepositoryCreationStore,
  RepositoryOwnerKind,
} from "./ports/creation.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function parseCreateCommand(raw: unknown): RepositoryCreateCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "Repository 建立資料格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  const allowed = ["requestId", "ownerAccountId", "ownerKind", "name"];
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
  return {
    requestId: value.requestId.toLowerCase(),
    ownerAccountId: value.ownerAccountId,
    ownerKind: value.ownerKind as RepositoryOwnerKind,
    name,
  };
}

export function createRepositoryCreation(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryCreationStore;
  now(): number;
}) {
  return {
    async owners(subject: string) {
      return deps.store().owners((await deps.activeUser(subject)).id);
    },
    async create(subject: string, raw: unknown) {
      const command = parseCreateCommand(raw);
      return deps.store().create((await deps.activeUser(subject)).id, command, deps.now());
    },
  };
}
