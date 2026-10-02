import { ProjectError } from "@line_bot_v1/project/domain";
import { projectFailure } from "../../../../../modules/project/http.server";
import { jsonResponse } from "../../../../../shared/server/http";
import { projectManagement } from "../../../_composition/project-management.server";
import { requestLineIdentity } from "../../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectNumber: string }> },
) {
  try {
    const { projectNumber } = await context.params;
    const ownerLogin = new URL(request.url).searchParams.get("owner");
    if (!ownerLogin) throw new ProjectError(400, "Project owner login 不正確。");
    return jsonResponse(
      await projectManagement.viewByNumber(
        await requestLineIdentity(request),
        ownerLogin,
        projectNumber,
      ),
    );
  } catch (error) {
    return projectFailure(error);
  }
}
