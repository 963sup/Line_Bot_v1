import type { createProjectWbs } from "@line_bot_v1/wbs/application/use-cases/project-content";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { jsonResponse } from "../../shared/server/http";
import {
  projectWbsBody,
  projectWbsFailure,
  projectWbsSelector,
} from "./project-wbs-transport.server";

export async function projectWbsRequest(
  request: Request,
  service: ReturnType<typeof createProjectWbs>,
  identity: (request: Request) => Promise<string>,
  history = false,
) {
  try {
    const subject = await identity(request);
    if (request.method === "POST") {
      return jsonResponse(await service.execute(subject, await projectWbsBody(request, 131_072)));
    }
    const query = new URL(request.url).searchParams;
    const selector = projectWbsSelector(query.get("projectId") ?? "");
    if (history) {
      return jsonResponse(
        await service.history(
          subject,
          selector,
          query.has("before") ? Number(query.get("before")) : undefined,
        ),
      );
    }
    return jsonResponse(
      await service.read(
        subject,
        selector,
        query.has("revisionId") ? (query.get("revisionId") ?? "") : undefined,
      ),
    );
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return projectWbsFailure(error);
  }
}
