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

export class ProjectRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function payload<T>(response: Response, fallback: string): Promise<T> {
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
  return value as T;
}

export async function requestProjectActor(token: string): Promise<ProjectActor> {
  const response = await fetch("/api/membership?view=account", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "x-line-token": token },
  });
  const value = await payload<{
    member?: { id?: unknown; login?: unknown; status?: unknown } | null;
  }>(response, "會員資料讀取失敗。");
  if (
    value.member?.status !== "active" ||
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
    headers: { "x-line-token": token },
  });
  const value = await payload<{
    items?: readonly {
      id?: unknown;
      login?: unknown;
      status?: unknown;
      actorIsOwner?: unknown;
    }[];
  }>(response, "Organization 清單讀取失敗。");
  if (!Array.isArray(value.items)) {
    throw new ProjectRequestError("Organization 清單回應不完整。", 503);
  }
  return value.items.flatMap((item) =>
    item.status === "active" &&
    item.actorIsOwner === true &&
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
    headers: { "x-line-token": token },
  });
  return payload<ProjectManagementView>(response, "Project 讀取失敗。");
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
    headers: { "x-line-token": token },
  });
  const value = await payload<{ users?: readonly ProjectDirectoryUser[] }>(
    response,
    "Project 使用者資料讀取失敗。",
  );
  if (!Array.isArray(value.users)) {
    throw new ProjectRequestError("Project 使用者資料回應不完整。", 503);
  }
  return value.users;
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
    headers: { "x-line-token": token },
  });
  const value = await payload<{ user?: ProjectDirectoryUser }>(
    response,
    "找不到可使用的 User，請確認登入名稱。",
  );
  if (!value.user || typeof value.user.id !== "string" || typeof value.user.login !== "string") {
    throw new ProjectRequestError("使用者資料回應不完整。", 503);
  }
  return value.user;
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
      "x-line-token": token,
    },
    body: JSON.stringify(command),
  });
  return payload<ProjectManagementReceipt>(response, "Project 操作失敗。");
}
