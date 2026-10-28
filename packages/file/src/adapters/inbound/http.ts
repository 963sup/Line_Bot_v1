import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import type { createFiles } from "../../application/use-cases/files.js";
import { FileError } from "../../domain/error.js";

type FileHttpOwner = Pick<
  ReturnType<typeof createFiles>,
  "overview" | "list" | "pendingUploads" | "file" | "source" | "prepareUpload" | "completeUpload"
>;
type FileHttpScope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
};
export type FileHttpRuntime = {
  scope(
    subject: string,
    selector: { ownerLogin: string; repositoryName: string },
  ): Promise<FileHttpScope>;
  owner(): FileHttpOwner;
};
export type FileHttpContext = {
  identity(request: Request): Promise<string>;
  origin(): string | undefined;
  knownErrors?: readonly (abstract new (...args: never[]) => Error & { readonly status: number })[];
  observeError?(error: unknown, status: number): void;
  scope: FileHttpRuntime["scope"];
};
const uploadLimit = 3_000_000;
const jsonLimit = 524_288;
function jsonResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
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
function originGuard(request: Request, origin: string | undefined) {
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
/** Factory for the File HTTP boundary; host identity, locator scope and telemetry are injected. */
export function createFileHttpAdapter(deps: FileHttpContext & Pick<FileHttpRuntime, "owner">) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "GET" && request.method !== "POST")
        throw new FileError(405, "File method is not available.", "INVALID_INPUT");
      if (request.method === "POST") originGuard(request, deps.origin());
      const subject = await deps.identity(request);
      const scope = await deps.scope(subject, selector(new URL(request.url).searchParams));
      return await fileHttpRequest(request, scope, deps.owner());
    } catch (error) {
      const known =
        error instanceof FileError ||
        deps.knownErrors?.some((ErrorType) => error instanceof ErrorType);
      const candidate: unknown =
        known && error instanceof Error ? Reflect.get(error, "status") : undefined;
      const status = typeof candidate === "number" ? candidate : 500;
      deps.observeError?.(error, status);
      return jsonResponse(
        {
          error: known && error instanceof Error ? error.message : String(error),
          ...(error instanceof FileError ? { code: error.code } : {}),
        },
        status,
      );
    }
  };
}
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new FileError(415, "JSON is required.", "INVALID_INPUT");
  const reader = request.body?.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let body = "";
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > jsonLimit) {
          await reader.cancel();
          throw new FileError(413, "Browser upload is too large.", "INVALID_INPUT");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalid();
    return { ...parsed };
  } catch (error) {
    if (error instanceof FileError) throw error;
    return invalid("Invalid JSON body.");
  }
}
function scopedCommand(value: unknown, scope: FileHttpScope): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("File command is required.");
  const command = { ...value };
  if (Reflect.get(command, "repositoryId") !== scope.repository.id)
    return invalid("File command does not match Repository scope.");
  return command;
}
/** Translate HTTP using the already verified actor and Repository scope. */
async function fileHttpRequest(request: Request, scope: FileHttpScope, owner: FileHttpOwner) {
  const query = new URL(request.url).searchParams;
  if (request.method === "GET") {
    const view = query.get("view") ?? "list";
    if (view === "list")
      return jsonResponse({
        ...scope,
        ...(query.has("after")
          ? {
              ...(await owner.list(
                scope.actorUserId,
                scope.repository.id,
                query.get("after") ?? undefined,
              )),
              uploads: [],
              pendingNext: null,
            }
          : await owner.overview(scope.actorUserId, scope.repository.id)),
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
        scope.actorUserId,
        scope.repository.id,
        fileId,
        revisionId,
        uploadLimit,
      );
      return new Response(original.bytes, {
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
  const command = scopedCommand(body.command, scope);
  if (body.operation === "prepare-upload" || body.operation === "complete-upload") {
    if (
      typeof command.byteLength !== "number" ||
      !Number.isSafeInteger(command.byteLength) ||
      command.byteLength < 1 ||
      command.byteLength > uploadLimit
    )
      throw new FileError(413, "Browser upload is limited to 3 MB.", "INVALID_INPUT");
    return jsonResponse(
      body.operation === "prepare-upload"
        ? await owner.prepareUpload(scope.actorUserId, command)
        : await owner.completeUpload(scope.actorUserId, command),
    );
  }
  if (body.operation === "run" || body.operation === "result")
    return invalid("File processing is owned by Intelligence.");
  return invalid("Unknown File operation.");
}
