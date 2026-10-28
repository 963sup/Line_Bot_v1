import { randomUUID } from "node:crypto";
import { UserError } from "@line_bot_v1/account/domain/user";
import type { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import { logServerError } from "../../shared/observability/runtime-error.server";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

type Scope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
};
export type ContractWebRuntime = {
  scope(subject: string, selector: { ownerLogin: string; repositoryName: string }): Promise<Scope>;
  owner(): ReturnType<typeof createContracts>;
};
function selector(query: URLSearchParams) {
  try {
    const ownerLogin = normalizeAccountLogin(query.get("owner") ?? "");
    const repositoryName = normalizeRepositoryName(query.get("name") ?? "");
    if (!repositoryName) throw new Error();
    return { ownerLogin, repositoryName };
  } catch {
    throw new ContractError(400, "Repository locator is invalid.", "INVALID_INPUT");
  }
}
async function body(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://"))
    throw new ContractError(503, "Service origin is unavailable.", "UNAVAILABLE");
  if (request.headers.get("origin") !== origin)
    throw new ContractError(403, "Use the Line_Bot_v1 application.", "FORBIDDEN");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ContractError(415, "JSON is required.", "INVALID_INPUT");
  let text: string;
  try {
    text = await readBodyText(request, 524_288);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      throw new ContractError(413, "Content is too large.", "INVALID_INPUT");
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ContractError(400, "Invalid JSON body.", "INVALID_INPUT");
  }
}
function failure(error: unknown) {
  const known =
    error instanceof ContractError ||
    error instanceof RepositoryError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 500;
  const traceId = randomUUID();
  logServerError(error, {
    service: "repository-contracts-api",
    operation: "request",
    status,
    traceId,
  });
  return jsonResponse(
    {
      error: error instanceof Error ? error.message : String(error),
      ...(!known ? { code: "INTERNAL_ERROR" } : {}),
      ...(status >= 500 ? { traceId } : {}),
      ...(error instanceof ContractError ? { code: error.code } : {}),
    },
    status,
  );
}
export async function contractsRequest(
  request: Request,
  runtime: ContractWebRuntime,
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
        throw new ContractError(400, "Contract scope does not match the URL.", "INVALID_INPUT");
      return jsonResponse(await owner.execute(scope.actorUserId, command));
    }
    const contractId = query.get("contractId");
    const view = query.get("view") ?? (contractId ? "read" : "list");
    if (view === "list")
      return jsonResponse({
        ...scope,
        ...(await owner.list(
          scope.actorUserId,
          scope.repository.id,
          query.get("after") ?? undefined,
        )),
      });
    if (!contractId) throw new ContractError(400, "Contract ID is required.", "INVALID_INPUT");
    if (view === "history")
      return jsonResponse({
        ...scope,
        ...(await owner.history(
          scope.actorUserId,
          { repositoryId: scope.repository.id, contractId },
          query.has("before") ? Number(query.get("before")) : undefined,
        )),
      });
    if (view === "read")
      return jsonResponse({
        ...scope,
        revision: await owner.read(scope.actorUserId, {
          repositoryId: scope.repository.id,
          contractId,
          ...(query.has("revisionId") ? { revisionId: query.get("revisionId") ?? "" } : {}),
        }),
      });
    throw new ContractError(400, "Unknown Contract query.", "INVALID_INPUT");
  } catch (error) {
    return failure(error);
  }
}
