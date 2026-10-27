import type { createFiles } from "../../application/use-cases/files.js";
import { FileError } from "../../domain/error.js";

/** Web-standard inbound adapter; identity and Repository locator resolution belong to the host. */
export type FileHttpOwner = ReturnType<typeof createFiles>;
export type FileHttpScope = {
  actorUserId: string;
  repository: { id: string; ownerLogin: string; name: string };
  archived: boolean;
  canEdit: boolean;
  canManage: boolean;
};
const uploadLimit = 3_000_000;
const jsonLimit = 524_288;

function invalid(message = "Invalid File request."): never {
  throw new FileError(400, message, "INVALID_INPUT");
}
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
function checkScope(value: unknown, scope: FileHttpScope) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("File command is required.");
  if (Reflect.get(value, "repositoryId") !== scope.repository.id)
    return invalid("File command does not match Repository scope.");
}
function commandRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return { ...value };
}

/** File alone maps its queries and commands; the host must supply a verified actor and locator. */
export async function fileHttpRequest(request: Request, scope: FileHttpScope, owner: FileHttpOwner) {
  const query = new URL(request.url).searchParams;
  if (request.method !== "GET" && request.method !== "POST")
    throw new FileError(405, "File method is not available.", "INVALID_INPUT");
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
