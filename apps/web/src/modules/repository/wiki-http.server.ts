import type { createWikiHistory } from "@line_bot_v1/wiki/application/use-cases/history";
import type { createWiki } from "@line_bot_v1/wiki/application/use-cases/pages";
import { WikiError } from "@line_bot_v1/wiki/domain/wiki-error";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure, repositoryPathSelector } from "./http.server";

type WikiWebScope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  canEdit: boolean;
  canManageRepository: boolean;
  archived: boolean;
};
export type WikiWebRuntime = {
  scope(
    subject: string,
    selector: { ownerLogin: string; repositoryName: string },
  ): Promise<WikiWebScope>;
  pages(): ReturnType<typeof createWiki>;
  history(): ReturnType<typeof createWikiHistory>;
};
export async function wikiRequest(
  request: Request,
  runtime: WikiWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    const query = new URL(request.url).searchParams;
    const scope = await runtime.scope(
      subject,
      repositoryPathSelector(query.get("owner") ?? "", query.get("name") ?? ""),
    );
    const user = scope.actorUserId,
      repositoryId = scope.repository.id;
    if (request.method === "POST") {
      const command = await repositoryBody(request, 2097152);
      if (command.repositoryId !== repositoryId)
        throw new WikiError(400, "Wiki scope does not match this Repository URL.");
      if (
        query.has("pageId") &&
        (typeof command.pageId !== "string" ||
          command.pageId.toLowerCase() !== query.get("pageId")?.toLowerCase())
      )
        throw new WikiError(400, "Wiki page does not match this request URL.");
      return jsonResponse(await runtime.pages().execute(user, command));
    }
    const pageId = query.get("pageId");
    const view = query.get("view") ?? (pageId ? "page" : "list");
    if (view === "list")
      return jsonResponse({
        ...scope,
        ...(await runtime.pages().list(user, repositoryId, query.get("after") ?? undefined)),
      });
    if (!pageId) throw new WikiError(400, "Wiki page ID is required.");
    const selector = { repositoryId, pageId };
    if (view === "page")
      return jsonResponse({
        ...scope,
        revision: await runtime.pages().read(user, {
          ...selector,
          ...(query.has("revisionId") ? { revisionId: query.get("revisionId") ?? "" } : {}),
        }),
      });
    if (view === "history")
      return jsonResponse({
        ...scope,
        ...(await runtime
          .history()
          .history(user, selector, query.has("before") ? Number(query.get("before")) : undefined)),
      });
    if (view === "compare")
      return jsonResponse({
        ...scope,
        ...(await runtime
          .history()
          .compare(user, selector, query.get("beforeId") ?? "", query.get("afterId") ?? "")),
      });
    throw new WikiError(400, "Unknown Wiki query.");
  } catch (error) {
    if (error instanceof WikiError) return jsonResponse({ error: error.message }, error.status);
    return repositoryFailure(error);
  }
}
