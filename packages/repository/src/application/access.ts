import { normalizeRepositoryName, RepositoryError } from "../domain.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";
import type {
  RepositoryAccessCommand,
  RepositoryAccessStore,
  RepositoryAccessSubjectKind,
} from "./ports/access.js";
import type { RepositorySelector } from "./ports/selectors.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;
const capabilities = new Set(["read", "triage", "write", "admin"]);

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

function parseCommand(raw: unknown): RepositoryAccessCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RepositoryError(400, "Repository access 操作格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  if (value.action !== "grant" && value.action !== "revoke") {
    throw new RepositoryError(400, "Repository access 動作不正確。");
  }
  const allowed =
    value.action === "grant"
      ? [
          "action",
          "requestId",
          "repositoryId",
          "subjectKind",
          "subjectId",
          "capability",
          "expectedVersion",
        ]
      : ["action", "requestId", "repositoryId", "subjectKind", "subjectId", "expectedVersion"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RepositoryError(400, "Repository access 操作包含不支援的欄位。");
  }
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new RepositoryError(400, "Repository access 請求編號不正確。");
  }
  if (typeof value.repositoryId !== "string" || !identifierPattern.test(value.repositoryId)) {
    throw new RepositoryError(400, "Repository 識別碼不正確。");
  }
  if (value.subjectKind !== "USER" && value.subjectKind !== "TEAM") {
    throw new RepositoryError(400, "Repository access 對象類型不正確。");
  }
  if (typeof value.subjectId !== "string" || !identifierPattern.test(value.subjectId)) {
    throw new RepositoryError(400, "Repository access 對象不正確。");
  }
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < (value.action === "grant" ? 0 : 1)
  ) {
    throw new RepositoryError(400, "Repository access 版本不正確。");
  }
  const base = {
    requestId: value.requestId.toLowerCase(),
    repositoryId: value.repositoryId,
    subjectKind: value.subjectKind as RepositoryAccessSubjectKind,
    subjectId: value.subjectId,
    expectedVersion: value.expectedVersion,
  };
  if (value.action === "revoke") return { ...base, action: "revoke" };
  if (typeof value.capability !== "string" || !capabilities.has(value.capability)) {
    throw new RepositoryError(400, "Repository capability 不正確。");
  }
  return {
    ...base,
    action: "grant",
    capability: value.capability as "read" | "triage" | "write" | "admin",
  };
}

export function createRepositoryAccess(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryAccessStore;
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
