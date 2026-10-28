import { isRecord } from "@line_bot_v1/platform/validation";
import {
  parseProjectManagementReceipt,
  parseProjectManagementView,
} from "@line_bot_v1/project/application/management";
import type {
  ProjectManagementCommand,
  ProjectManagementReceipt,
  ProjectManagementView,
} from "@line_bot_v1/project/contracts/management";
import type { ProjectOwnerKind } from "@line_bot_v1/project/domain";

export type ProjectActor = Readonly<{ id: string; login: string }>;
export type ProjectOwnerOption = Readonly<{
  id: string;
  kind: ProjectOwnerKind;
  login: string;
}>;
export type ProjectDirectoryUser = Readonly<{ id: string; login: string | null }>;
export type ProjectRepositoryOption = Readonly<{ id: string; ownerLogin: string; name: string }>;

export async function requestProjectRepositories(
  token: string,
): Promise<readonly ProjectRepositoryOption[]> {
  const response = await fetch("/api/repositories", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const value = await payload(response, "儲存庫清單暫時無法讀取。");
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new ProjectRequestError("儲存庫清單回應不完整。", 503);
  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.ownerLogin !== "string" ||
      typeof item.name !== "string"
    )
      throw new ProjectRequestError("儲存庫清單回應不完整。", 503);
    return { id: item.id, ownerLogin: item.ownerLogin, name: item.name };
  });
}

export class ProjectRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function payload(response: Response, fallback: string): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ProjectRequestError(fallback, response.status || 503);
  }
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : fallback;
    throw new ProjectRequestError(message, response.status);
  }
  return value;
}

export async function requestProjectActor(token: string): Promise<ProjectActor> {
  const response = await fetch("/api/membership?view=account", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const value = await payload(response, "會員資料讀取失敗。");
  if (
    !isRecord(value) ||
    !isRecord(value.member) ||
    value.member.status !== "active" ||
    typeof value.member.id !== "string" ||
    typeof value.member.login !== "string"
  ) {
    throw new ProjectRequestError("請先完成有效會員登入。", 403);
  }
  return { id: value.member.id, login: value.member.login };
}

export async function requestProjectOwnerOrganizations(
  token: string,
): Promise<readonly ProjectOwnerOption[]> {
  const response = await fetch("/api/organization", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const value = await payload(response, "Organization 清單讀取失敗。");
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new ProjectRequestError("Organization 清單回應不完整。", 503);
  }
  return value.items.flatMap((item) =>
    isRecord(item) &&
    item.status === "active" &&
    item.actorCanCreateProjectV2 === true &&
    typeof item.id === "string" &&
    typeof item.login === "string"
      ? [{ id: item.id, kind: "ORGANIZATION" as const, login: item.login }]
      : [],
  );
}

export async function requestProjectView(
  token: string,
  projectId: string,
): Promise<ProjectManagementView> {
  const query = new URLSearchParams({ projectId });
  const response = await fetch(`/api/project-management?${query.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const value = await payload(response, "Project 讀取失敗。");
  try {
    return parseProjectManagementView(value);
  } catch {
    throw new ProjectRequestError("Project 回應不完整。", 503);
  }
}

export async function requestProjectUsers(
  token: string,
  projectId: string,
  userIds: readonly string[],
): Promise<readonly ProjectDirectoryUser[]> {
  const query = new URLSearchParams({ projectId });
  for (const userId of userIds) query.append("userId", userId);
  const response = await fetch(`/api/project-management/users?${query.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const value = await payload(response, "Project 使用者資料讀取失敗。");
  if (!isRecord(value) || !Array.isArray(value.users)) {
    throw new ProjectRequestError("Project 使用者資料回應不完整。", 503);
  }
  return value.users.map(readProjectDirectoryUser);
}

export async function requestProjectUserByLogin(
  token: string,
  projectId: string,
  rawLogin: string,
): Promise<ProjectDirectoryUser> {
  const query = new URLSearchParams({ projectId, login: rawLogin.trim() });
  const response = await fetch(`/api/project-management/users?${query.toString()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const value = await payload(response, "找不到可使用的 User，請確認登入名稱。");
  if (!isRecord(value)) {
    throw new ProjectRequestError("使用者資料回應不完整。", 503);
  }
  const user = readProjectDirectoryUser(value.user);
  if (user.login === null) throw new ProjectRequestError("使用者資料回應不完整。", 503);
  return user;
}

export async function postProjectCommand(
  token: string,
  command: ProjectManagementCommand,
): Promise<ProjectManagementReceipt> {
  const response = await fetch("/api/project-management", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "content-type": "application/json",
      "X-App-Session-Generation": token,
    },
    body: JSON.stringify(command),
  });
  const value = await payload(response, "Project request failed without a response body.");
  try {
    return parseProjectManagementReceipt(value);
  } catch {
    throw new ProjectRequestError("Project 操作回應不完整。", 503);
  }
}

function readProjectDirectoryUser(value: unknown): ProjectDirectoryUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.login !== null && typeof value.login !== "string")
  ) {
    throw new ProjectRequestError("使用者資料回應不完整。", 503);
  }
  return { id: value.id, login: value.login };
}
