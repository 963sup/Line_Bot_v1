import type { createProjectWbsGovernance } from "@line_bot_v1/wbs/application/use-cases/project-governance";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { jsonResponse } from "../../shared/server/http";
import {
  projectWbsBody,
  projectWbsFailure,
  projectWbsSelector,
} from "./project-wbs-transport.server";

export async function projectWbsGovernanceRequest(
  request: Request,
  service: ReturnType<typeof createProjectWbsGovernance>,
  identity: (request: Request) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    if (request.method === "POST") {
      return jsonResponse(await service.execute(subject, await projectWbsBody(request, 65_536)));
    }
    const query = new URL(request.url).searchParams;
    return jsonResponse(
      await service.view(subject, projectWbsSelector(query.get("projectId") ?? ""), {
        ...(query.has("proposalId") ? { proposalId: query.get("proposalId") ?? "" } : {}),
        ...(query.has("baselineId") ? { baselineId: query.get("baselineId") ?? "" } : {}),
        ...(query.has("proposalVersion")
          ? { proposalVersion: Number(query.get("proposalVersion")) }
          : {}),
        ...(query.has("beforeReview") ? { beforeReview: Number(query.get("beforeReview")) } : {}),
        ...(query.has("beforeProposal")
          ? { beforeProposal: Number(query.get("beforeProposal")) }
          : {}),
        ...(query.has("beforeBaseline")
          ? { beforeBaseline: Number(query.get("beforeBaseline")) }
          : {}),
      }),
    );
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return projectWbsFailure(error);
  }
}
