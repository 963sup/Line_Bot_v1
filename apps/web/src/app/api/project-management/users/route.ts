import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { ProjectError } from "@line_bot_v1/project/domain";
import { projectFailure } from "../../../../modules/project/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import {
  projectActorUserId,
  projectManagement,
  projectUserById,
  projectUserByLogin,
} from "../../_composition/project-management.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectUserQuery(request: Request) {
  const search = new URL(request.url).searchParams;
  const projectIds = search.getAll("projectId");
  const logins = search.getAll("login");
  const userIds = search.getAll("userId");
  if (
    [...search.keys()].some((key) => !["projectId", "login", "userId"].includes(key)) ||
    projectIds.length !== 1 ||
    !projectIds[0] ||
    (logins.length === 0 && userIds.length === 0) ||
    logins.length > 1 ||
    userIds.length > 100 ||
    (logins.length > 0 && userIds.length > 0) ||
    new Set(userIds).size !== userIds.length ||
    userIds.some((id) => !id || id.length > 128)
  ) {
    throw new ProjectError(400, "Project 使用者查詢參數不正確。");
  }
  return { projectId: projectIds[0], login: logins[0], userIds };
}

export async function GET(request: Request) {
  try {
    const identity = await requestLineIdentity(request);
    const query = projectUserQuery(request);
    const view = await projectManagement.view(identity, query.projectId);

    if (query.login !== undefined) {
      if (view.role !== "ADMIN") throw new ProjectError(403, "只有 Project 管理者能邀請協作者。");
      let login: string;
      try {
        login = normalizeAccountLogin(query.login);
      } catch {
        throw new ProjectError(400, "使用者登入名稱不正確。");
      }
      const user = await projectUserByLogin(login);
      if (!user) throw new ProjectError(404, "找不到可使用的 User。");
      return jsonResponse({ user });
    }

    const actorUserId = await projectActorUserId(identity);
    const visibleUserIds = new Set([
      actorUserId,
      ...(view.project.creator ? [view.project.creator] : []),
      ...view.collaborators.filter((item) => item.kind === "USER").map((item) => item.id),
      ...view.items.flatMap((item) => item.draft?.assigneeIds ?? []),
    ]);
    if (query.userIds.some((id) => !visibleUserIds.has(id))) {
      throw new ProjectError(404, "找不到可使用的 Project 使用者。");
    }
    const users = await Promise.all(
      query.userIds.map(async (id) => ({ id, user: await projectUserById(id) })),
    );
    return jsonResponse({
      users: users.map(({ id, user }) => ({ id, login: user?.login ?? null })),
    });
  } catch (error) {
    return projectFailure(error);
  }
}
