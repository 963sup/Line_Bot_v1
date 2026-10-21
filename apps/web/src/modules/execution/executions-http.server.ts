import { UserError } from "@line_bot_v1/account/domain/user";
import type { createExecutions } from "@line_bot_v1/execution/application/use-cases/executions";
import type { createTaskDependencies } from "@line_bot_v1/execution/application/use-cases/task-dependencies";
import { ExecutionError } from "@line_bot_v1/execution/domain/error";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { normalizeRepositoryName, RepositoryError } from "@line_bot_v1/repository/domain";
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
export type ExecutionWebRuntime = {
  scope(subject: string, selector: { ownerLogin: string; repositoryName: string }): Promise<Scope>;
  owner(): ReturnType<typeof createExecutions>;
  dependencies(): ReturnType<typeof createTaskDependencies>;
};
function selector(query: URLSearchParams) {
  try {
    const ownerLogin = normalizeAccountLogin(query.get("owner") ?? "");
    const repositoryName = normalizeRepositoryName(query.get("name") ?? "");
    if (!repositoryName) throw new Error();
    return { ownerLogin, repositoryName };
  } catch {
    throw new ExecutionError(400, "Repository locator is invalid.", "INVALID_INPUT");
  }
}
async function body(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://"))
    throw new ExecutionError(503, "Service origin is unavailable.", "UNAVAILABLE");
  if (request.headers.get("origin") !== origin)
    throw new ExecutionError(403, "Use the Line_Bot_v1 application.", "FORBIDDEN");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ExecutionError(415, "JSON is required.", "INVALID_INPUT");
  let text: string;
  try {
    text = await readBodyText(request, 524_288);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      throw new ExecutionError(413, "Content is too large.", "INVALID_INPUT");
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExecutionError(400, "Invalid JSON body.", "INVALID_INPUT");
  }
}
function failure(error: unknown) {
  const known =
    error instanceof ExecutionError ||
    error instanceof RepositoryError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "repository-executions-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: known ? error.message : "Execution service is unavailable.",
      ...(error instanceof ExecutionError ? { code: error.code } : {}),
    },
    status,
  );
}
export async function executionsRequest(
  request: Request,
  runtime: ExecutionWebRuntime,
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
        throw new ExecutionError(400, "Execution scope does not match the URL.", "INVALID_INPUT");
      if (command.action === "replace-dependencies")
        return jsonResponse(
          await runtime.dependencies().execute(scope.actorUserId, {
            ...command,
            action: "replace",
          }),
        );
      return jsonResponse(await owner.execute(scope.actorUserId, command));
    }
    const executionId = query.get("executionId");
    const view = query.get("view") ?? (executionId ? "read" : "list");
    if (view === "dependencies")
      return jsonResponse({
        ...scope,
        dependencies: await runtime.dependencies().read(scope.actorUserId, {
          repositoryId: scope.repository.id,
          planRevisionId: query.get("planRevisionId") ?? "",
        }),
      });
    if (view === "list") {
      const contractId = query.get("contractId");
      if (!contractId) throw new ExecutionError(400, "Contract ID is required.", "INVALID_INPUT");
      return jsonResponse({
        ...scope,
        ...(await owner.list(
          scope.actorUserId,
          { repositoryId: scope.repository.id, contractId },
          query.get("after") ?? undefined,
        )),
      });
    }
    if (!executionId) throw new ExecutionError(400, "Execution ID is required.", "INVALID_INPUT");
    if (view === "history")
      return jsonResponse({
        ...scope,
        ...(await owner.history(
          scope.actorUserId,
          { repositoryId: scope.repository.id, executionId },
          query.has("before") ? Number(query.get("before")) : undefined,
        )),
      });
    if (view === "read")
      return jsonResponse({
        ...scope,
        revision: await owner.read(scope.actorUserId, {
          repositoryId: scope.repository.id,
          executionId,
          ...(query.has("revisionId") ? { revisionId: query.get("revisionId") ?? "" } : {}),
        }),
      });
    throw new ExecutionError(400, "Unknown Execution query.", "INVALID_INPUT");
  } catch (error) {
    return failure(error);
  }
}
