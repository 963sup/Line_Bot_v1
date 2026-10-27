import { UserError } from "@line_bot_v1/account/domain/user";
import type { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import { captureHandledServerError } from "../../shared/observability/server-error";
import {
  BodyTooLargeError,
  jsonResponse,
  readBodyText,
} from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

type FileOwner = ReturnType<typeof createFiles>;
type Scope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
};
export type FilesWebRuntime = {
  scope(subject: string, selector: { ownerLogin: string; repositoryName: string }): Promise<Scope>;
  owner(): FileOwner;
};

const uploadLimit = 3_000_000;
const multipartLimit = 3_300_000;
const jsonLimit = 524_288;

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
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new FileError(415, "JSON is required.", "INVALID_INPUT");
  const text = await readBodyText(request, jsonLimit);
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
    return Object.fromEntries(Object.entries(value));
  } catch {
    return invalid("Invalid JSON body.");
  }
}
function checkScope(value: unknown, scope: Scope) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("File command is required.");
  if (Reflect.get(value, "repositoryId") !== scope.repository.id)
    return invalid("File command does not match Repository scope.");
}
function commandRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return Object.fromEntries(Object.entries(value));
}
function commandString(command: Record<string, unknown>, key: string): string {
  const value = command[key];
  if (typeof value !== "string" || !value) return invalid();
  return value;
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
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof FileError ? { code: error.code } : {}),
    },
    status,
  );
}

/** HTTP-only translation. Repository and File owners remain the authorities. */
export async function filesRequest(
  request: Request,
  runtime: FilesWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  try {
    if (request.method !== "GET" && request.method !== "POST")
      throw new FileError(405, "File method is not available.", "INVALID_INPUT");
    if (request.method === "POST") originGuard(request);

    const query = new URL(request.url).searchParams;
    const subject = await identity(request);
    const scope = await runtime.scope(subject, selector(query));
    const owner = runtime.owner();
    if (request.method === "GET") {
      const view = query.get("view") ?? "list";
      if (view === "list")
        return jsonResponse({
          ...scope,
          ...(await owner.list(
            scope.actorUserId,
            scope.repository.id,
            query.get("after") ?? undefined,
          )),
          uploadMaxBytes: uploadLimit,
        });
      if (view === "uploads")
        return jsonResponse(
          await owner.pendingUploads(
            scope.actorUserId,
            scope.repository.id,
            query.get("after") ?? undefined,
          ),
        );
      const fileId = query.get("fileId") ?? "";
      if (view === "file") {
        const file = await owner.file(
          scope.actorUserId,
          scope.repository.id,
          fileId,
          query.get("revisionId") ?? undefined,
        );
        return jsonResponse({
          ...scope,
          file,
          processing: null,
        });
      }
      if (view === "runs" || view === "processing")
        return invalid("File processing is owned by Intelligence.");
      if (view === "download") {
        const revisionId = query.get("revisionId") ?? "";
        // File owner bounds the payload before Storage I/O, while retaining post-I/O authorization.
        const original = await owner.source(
          scope.actorUserId, scope.repository.id, fileId, revisionId, uploadLimit,
        );
        return new Response(Uint8Array.from(original.bytes).buffer, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "attachment",
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
          },
        });
      }
      return invalid("Unknown File query.");
    }

    const body = await jsonBody(request);
    if (Object.keys(body).some((key) => !["operation", "command"].includes(key)))
      return invalid("Unknown File operation field.");
    checkScope(body.command, scope);
    if (body.operation === "prepare-upload" || body.operation === "complete-upload") {
      const command = commandRecord(body.command);
      if (typeof command.byteLength !== "number" ||
          !Number.isSafeInteger(command.byteLength) ||
          command.byteLength < 1 || command.byteLength > uploadLimit)
        throw new FileError(413, "Browser upload is limited to 3 MB.", "INVALID_INPUT");
      return jsonResponse(body.operation === "prepare-upload"
        ? await owner.prepareUpload(scope.actorUserId, command)
        : await owner.completeUpload(scope.actorUserId, command));
    }
    if (body.operation === "run" || body.operation === "result")
      return invalid("File processing is owned by Intelligence.");
    return invalid("Unknown File operation.");
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return failure(new FileError(413, "Browser upload is too large.", "INVALID_INPUT"));
    return failure(error);
  }
}
