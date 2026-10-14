import type { createWbs } from "@line_bot_v1/wbs/application/use-cases/content";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure, repositoryPathSelector } from "./http.server";

export async function wbsRequest(
  request: Request,
  service: ReturnType<typeof createWbs>,
  identity: (r: Request) => Promise<string>,
  history = false,
) {
  try {
    const subject = await identity(request);
    if (request.method === "POST")
      return jsonResponse(await service.execute(subject, await repositoryBody(request, 131072)));
    const query = new URL(request.url).searchParams;
    const selector = repositoryPathSelector(query.get("owner") ?? "", query.get("name") ?? "");
    if (history)
      return jsonResponse(
        await service.history(
          subject,
          selector,
          query.has("before") ? Number(query.get("before")) : undefined,
        ),
      );
    return jsonResponse(
      await service.read(
        subject,
        selector,
        query.has("revisionId") ? (query.get("revisionId") ?? "") : undefined,
      ),
    );
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return repositoryFailure(error);
  }
}
