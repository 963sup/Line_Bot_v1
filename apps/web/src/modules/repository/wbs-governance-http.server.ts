import type { createWbsGovernance } from "@line_bot_v1/wbs/application/use-cases/governance";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure, repositoryPathSelector } from "./http.server";

export async function wbsGovernanceRequest(
  request: Request,
  service: ReturnType<typeof createWbsGovernance>,
  identity: (r: Request) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    if (request.method === "POST")
      return jsonResponse(await service.execute(subject, await repositoryBody(request, 65536)));
    const q = new URL(request.url).searchParams;
    return jsonResponse(
      await service.view(
        subject,
        repositoryPathSelector(q.get("owner") ?? "", q.get("name") ?? ""),
        {
          ...(q.has("proposalId") ? { proposalId: q.get("proposalId") ?? "" } : {}),
          ...(q.has("baselineId") ? { baselineId: q.get("baselineId") ?? "" } : {}),
          ...(q.has("proposalVersion")
            ? { proposalVersion: Number(q.get("proposalVersion")) }
            : {}),
          ...(q.has("beforeReview") ? { beforeReview: Number(q.get("beforeReview")) } : {}),
          ...(q.has("beforeProposal") ? { beforeProposal: Number(q.get("beforeProposal")) } : {}),
          ...(q.has("beforeBaseline") ? { beforeBaseline: Number(q.get("beforeBaseline")) } : {}),
        },
      ),
    );
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return repositoryFailure(error);
  }
}
