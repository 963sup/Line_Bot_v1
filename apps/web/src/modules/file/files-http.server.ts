import { UserError } from "@line_bot_v1/account/domain/user";
import type { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { IntelligenceError } from "@line_bot_v1/intelligence/domain/error";
import type { createIntelligenceProcessing } from "@line_bot_v1/intelligence/application/use-cases/processing";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import { captureHandledServerError } from "../../shared/observability/server-error";
import {
  BodyTooLargeError,
  jsonResponse,
  readBodyBytes,
  readBodyText,
} from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

type FileOwner = ReturnType<typeof createFiles>;
type ProcessingOwner = ReturnType<typeof createIntelligenceProcessing>;
type FileProcessor = Parameters<ProcessingOwner["run"]>[2];
type ProcessingRunCommand = Parameters<ProcessingOwner["run"]>[1];
type ProcessingResultCommand = Parameters<ProcessingOwner["result"]>[1];
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
  processors(): readonly FileProcessor[];
  processingOwner(): ProcessingOwner;
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
async function uploadBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType))
    throw new FileError(415, "Multipart upload is required.", "INVALID_INPUT");
  const bounded = await readBodyBytes(request, multipartLimit);
  let form: FormData;
  try {
    form = await new Response(Uint8Array.from(bounded).buffer, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return invalid("Invalid multipart File request.");
  }
  if ([...form.keys()].some((key) => key !== "file" && key !== "command"))
    return invalid("Unknown upload field.");
  const commandText = form.get("command");
  const file = form.get("file");
  if (typeof commandText !== "string" || !(file instanceof File))
    return invalid("File and command are required.");
  if (file.size < 1 || file.size > uploadLimit)
    throw new FileError(413, "Browser upload is limited to 3 MB.", "INVALID_INPUT");
  let command: unknown;
  try {
    command = JSON.parse(commandText);
  } catch {
    return invalid("Invalid upload command.");
  }
  if (!command || typeof command !== "object" || Array.isArray(command))
    return invalid("Invalid upload command.");
  const fields = Object.fromEntries(Object.entries(command));
  if (fields.name !== file.name || fields.mediaType !== (file.type || "application/octet-stream"))
    return invalid("Declared source metadata does not match the selected file.");
  return { command: fields, bytes: new Uint8Array(await file.arrayBuffer()) };
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
function processingRunCommand(value: unknown): ProcessingRunCommand {
  const command = commandRecord(value);
  const expectedVersion = command.expectedVersion;
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) return invalid();
  return {
    repositoryId: commandString(command, "repositoryId"),
    requestId: commandString(command, "requestId"),
    runId: commandString(command, "runId"),
    fileId: commandString(command, "fileId"),
    fileRevisionId: commandString(command, "fileRevisionId"),
    expectedVersion: Number(expectedVersion),
  };
}
function processingResultCommand(value: unknown): ProcessingResultCommand {
  const command = commandRecord(value);
  const expectedVersion = command.expectedVersion;
  const action = command.action;
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) return invalid();
  if (action !== "save" && action !== "discard") return invalid();
  if (!Array.isArray(command.edits)) return invalid();
  return {
    repositoryId: commandString(command, "repositoryId"),
    requestId: commandString(command, "requestId"),
    runId: commandString(command, "runId"),
    expectedVersion: Number(expectedVersion),
    action,
    edits: Array.from(command.edits),
  };
}
function failure(error: unknown) {
  const known =
    error instanceof FileError ||
    error instanceof IntelligenceError ||
    error instanceof UserError ||
    error instanceof RepositoryError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "repository-files-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: known ? error.message : "File service is unavailable.",
      ...(error instanceof FileError || error instanceof IntelligenceError
        ? { code: error.code }
        : {}),
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
    const intelligence = query.get("ownerKind") === "intelligence";
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
          processors: runtime
            .processors()
            .filter((p) => p.supports(file.mediaType))
            .map((p) => ({
              id: p.id,
              kind: p.kind,
              version: p.version,
            })),
        });
      }
      if (view === "runs" && intelligence)
        return jsonResponse({
          ...scope,
          ...(await runtime
            .processingOwner()
            .list(scope.actorUserId, scope.repository.id, fileId, query.get("after") ?? undefined)),
        });
      if (view === "processing" && intelligence)
        return jsonResponse({
          ...scope,
          processing: await runtime
            .processingOwner()
            .read(
              scope.actorUserId,
              scope.repository.id,
              query.get("runId") ?? "",
              query.get("revisionId") ?? undefined,
            ),
        });
      if (view === "download") {
        const revisionId = query.get("revisionId") ?? "";
        const descriptor = await owner.file(
          scope.actorUserId,
          scope.repository.id,
          fileId,
          revisionId,
        );
        if (descriptor.byteLength > uploadLimit)
          throw new FileError(413, "Web download is limited to 3 MB.", "INVALID_INPUT");
        const original = await owner.source(
          scope.actorUserId,
          scope.repository.id,
          fileId,
          revisionId,
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

    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const upload = await uploadBody(request);
      checkScope(upload.command, scope);
      return jsonResponse(await owner.upload(scope.actorUserId, upload.command, upload.bytes));
    }
    const body = await jsonBody(request);
    if (Object.keys(body).some((key) => !["operation", "command", "processor"].includes(key)))
      return invalid("Unknown File operation field.");
    checkScope(body.command, scope);
    if (body.operation === "run" && query.get("ownerKind") === "intelligence") {
      if (typeof body.processor !== "string") return invalid("Processor must be selected.");
      const processor = runtime.processors().find((p) => p.id === body.processor);
      if (!processor) return invalid("Selected Processor is unavailable.");
      return jsonResponse(
        await runtime
          .processingOwner()
          .run(scope.actorUserId, processingRunCommand(body.command), processor),
      );
    }
    if (body.operation === "result" && query.get("ownerKind") === "intelligence") {
      if (body.processor !== undefined) return invalid("Result cannot select a Processor.");
      return jsonResponse(
        await runtime
          .processingOwner()
          .result(scope.actorUserId, processingResultCommand(body.command)),
      );
    }
    return invalid("Unknown File operation.");
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return failure(new FileError(413, "Browser upload is too large.", "INVALID_INPUT"));
    return failure(error);
  }
}
