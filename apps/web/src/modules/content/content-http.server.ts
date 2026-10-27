import { UserError } from "@line_bot_v1/account/domain/user";
import type { createContentPlans } from "@line_bot_v1/content/application/use-cases/plans";
import { ContentError } from "@line_bot_v1/content/domain/error";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

type Scope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
};
export type ContentWebRuntime = {
  scope(subject: string, selector: { ownerLogin: string; repositoryName: string }): Promise<Scope>;
  owner(): ReturnType<typeof createContentPlans>;
};

function selector(query: URLSearchParams) {
  try {
    const ownerLogin = normalizeAccountLogin(query.get("owner") ?? "");
    const repositoryName = normalizeRepositoryName(query.get("name") ?? "");
    if (!repositoryName) throw new Error();
    return { ownerLogin, repositoryName };
  } catch {
    throw new ContentError(400, "Repository locator is invalid.", "INVALID_INPUT");
  }
}

async function body(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://"))
    throw new ContentError(503, "Service origin is unavailable.", "UNAVAILABLE");
  if (request.headers.get("origin") !== origin)
    throw new ContentError(403, "Use the Line_Bot_v1 application.", "FORBIDDEN");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ContentError(415, "JSON is required.", "INVALID_INPUT");
  let text: string;
  try {
    text = await readBodyText(request, 524_288);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      throw new ContentError(413, "Content is too large.", "INVALID_INPUT");
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ContentError(400, "Invalid JSON body.", "INVALID_INPUT");
  }
}

function failure(error: unknown) {
  const known =
    error instanceof ContentError ||
    error instanceof RepositoryError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 500;
  captureHandledServerError(error, {
    service: "repository-content-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof ContentError ? { code: error.code } : {}),
    },
    status,
  );
}

export async function contentRequest(
  request: Request,
  runtime: ContentWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  try {
    const command = request.method === "POST" ? await body(request) : undefined;
    const subject = await identity(request);
    const query = new URL(request.url).searchParams;
    const scope = await runtime.scope(subject, selector(query));
    const owner = runtime.owner();
    if (request.method === "POST") {
      if (command?.repositoryId !== scope.repository.id)
        throw new ContentError(400, "Content scope does not match the URL.", "INVALID_INPUT");
      return jsonResponse(await owner.execute(scope.actorUserId, command));
    }
    const before = query.get("before");
    if (query.get("view") === "history")
      return jsonResponse({
        ...scope,
        ...(await owner.history(
          scope.actorUserId,
          { repositoryId: scope.repository.id },
          before === null ? undefined : Number(before),
        )),
      });
    try {
      return jsonResponse({
        ...scope,
        revision: await owner.read(scope.actorUserId, {
          repositoryId: scope.repository.id,
          ...(query.has("revisionId") ? { revisionId: query.get("revisionId") ?? "" } : {}),
        }),
      });
    } catch (error) {
      if (!query.has("revisionId") && error instanceof ContentError && error.code === "NOT_FOUND")
        return jsonResponse({ ...scope, revision: null });
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
