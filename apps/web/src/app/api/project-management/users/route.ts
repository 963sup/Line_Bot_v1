import { ProjectError } from "@line_bot_v1/project/domain";
import { projectFailure } from "../../../../modules/project/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { projectUsers } from "../../_composition/project-management.server";
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
    return jsonResponse(
      await projectUsers(identity, {
        projectId: query.projectId,
        userIds: query.userIds,
        ...(query.login !== undefined ? { login: query.login } : {}),
      }),
    );
  } catch (error) {
    return projectFailure(error);
  }
}
