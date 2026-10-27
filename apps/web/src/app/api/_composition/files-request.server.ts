import { UserError } from "@line_bot_v1/account/domain/user";
import type { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import { captureHandledServerError } from "../../../shared/observability/server-error";
import { jsonResponse } from "../../../shared/server/http";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";

type FileHttpOwner = ReturnType<typeof createFiles>;
type FileHttpScope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
};

export type FilesWebRuntime = {
  scope(
    subject: string,
    selector: { ownerLogin: string; repositoryName: string },
  ): Promise<FileHttpScope>;
  owner(): FileHttpOwner;
  /** Concrete File inbound adapter is injected only by the outer composition root. */
  dispatch(request: Request, scope: FileHttpScope, owner: FileHttpOwner): Promise<Response>;
};
function invalid(message = "Invalid File request."): never {
  throw new FileError(400, message, "INVALID_INPUT");
}
function selector(query: URLSearchParams) {
  try {
    const ownerLogin = normalizeAccountLogin(query.get("owner") ?? "");
    const repositoryName = normalizeRepositoryName(query.get("name") ?? "");
    if (!repositoryName) return invalid("Repository locator is invalid.");
    return { ownerLogin, repositoryName };
  } catch {
    return invalid("Repository locator is invalid.");
  }
}
function originGuard(request: Request) {
  const origin = process.env.APP_ORIGIN;
  let correct = false;
  try {
    correct = !!origin && origin.startsWith("https://") && new URL(origin).origin === origin;
  } catch {
    // Invalid deployment configuration must fail closed.
  }
  if (!correct) throw new FileError(503, "Service origin is unavailable.", "UNAVAILABLE");
  if (request.headers.get("origin") !== origin)
    throw new FileError(403, "Use the Line_Bot_v1 application.", "FORBIDDEN");
}
function failure(error: unknown) {
  const known =
    error instanceof FileError ||
    error instanceof UserError ||
    error instanceof RepositoryError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 500;
  captureHandledServerError(error, {
    service: "repository-files-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: known && error instanceof Error ? error.message : "File operation failed.",
      ...(error instanceof FileError ? { code: error.code } : {}),
    },
    status,
  );
}

/** Host-only identity, origin and locator bridge. File commands live in the owner adapter. */
export async function filesRequest(
  request: Request,
  runtime: FilesWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  try {
    if (request.method !== "GET" && request.method !== "POST")
      throw new FileError(405, "File method is not available.", "INVALID_INPUT");
    if (request.method === "POST") originGuard(request);
    const subject = await identity(request);
    const scope = await runtime.scope(subject, selector(new URL(request.url).searchParams));
    return await runtime.dispatch(request, scope, runtime.owner());
  } catch (error) {
    return failure(error);
  }
}
