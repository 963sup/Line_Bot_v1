import { ProjectError } from "@line_bot_v1/project/domain";
import { projectBody, projectFailure } from "../../../modules/project/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { projectManagement } from "../_composition/project-management.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) throw new ProjectError(400, "Project 識別碼不正確。");
    return jsonResponse(
      await projectManagement.view(await requestLineIdentity(request), projectId),
    );
  } catch (error) {
    return projectFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    return jsonResponse(
      await projectManagement.command(
        await requestLineIdentity(request),
        await projectBody(request),
      ),
    );
  } catch (error) {
    return projectFailure(error);
  }
}
