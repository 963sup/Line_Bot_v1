import { randomUUID } from "node:crypto";
import { UserError } from "@line_bot_v1/account/domain/user";
import type {
  CommercialDocumentReceipt,
  CommercialDraftRevision,
} from "@line_bot_v1/contract/contracts/output/commercial-documents";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { FileError } from "@line_bot_v1/file/domain/error";
import {
  type CommercialIntake,
  CommercialIntakeError,
} from "@line_bot_v1/intelligence/contracts/output/commercial-intake";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain/repository/value-objects/repository-name";
import { logServerError } from "../../shared/observability/runtime-error.server";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export type CommercialWebRuntime = {
  scope(
    subject: string,
    selector: { ownerLogin: string; repositoryName: string },
  ): Promise<{
    actorUserId: string;
    repository: { id: string };
    canEdit: boolean;
    archived: boolean;
  }>;
  intake: Pick<CommercialIntake, "start" | "status" | "resume">;
  documents: {
    readBySource(
      actor: string,
      query: { repositoryId: string; fileId: string; fileRevisionId: string },
    ): Promise<CommercialDraftRevision | null>;
    read(
      actor: string,
      query: { repositoryId: string; documentId: string },
    ): Promise<CommercialDraftRevision | null>;
    receipt(
      actor: string,
      query: { repositoryId: string; commandId: string },
    ): Promise<CommercialDocumentReceipt | null>;
  };
};
function invalid(message = "Invalid commercial document request."): never {
  throw new ContractError(400, message, "INVALID_INPUT");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}
function exactFields(input: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    invalid("Unknown or missing command field.");
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128) invalid();
  return value;
}
async function body(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || !origin.startsWith("https://") || new URL(origin).origin !== origin)
    throw new ContractError(503, "Service unavailable.", "UNAVAILABLE");
  if (request.headers.get("origin") !== origin)
    throw new ContractError(403, "Use the application origin.", "FORBIDDEN");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ContractError(415, "JSON is required.", "INVALID_INPUT");
  try {
    return record(JSON.parse(await readBodyText(request, 8192)));
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError(
      error instanceof BodyTooLargeError ? 413 : 400,
      "Invalid request body.",
      "INVALID_INPUT",
    );
  }
}
export async function commercialIntakeRequest(
  request: Request,
  runtime: CommercialWebRuntime,
  identity: (request: Request) => Promise<string>,
  resource: "intake" | "document" = "intake",
) {
  const traceId = randomUUID();
  let operation = "request";
  try {
    const subject = await identity(request);
    const query = new URL(request.url).searchParams;
    let ownerLogin: string, repositoryName: string;
    try {
      ownerLogin = normalizeAccountLogin(query.get("owner") ?? "");
      repositoryName = string(normalizeRepositoryName(query.get("name") ?? ""));
      if (!repositoryName) invalid();
    } catch {
      invalid("Invalid repository locator.");
    }
    const scope = await runtime.scope(subject, { ownerLogin, repositoryName });
    if (request.method !== "GET" && request.method !== "POST")
      throw new ContractError(405, "Method unavailable.", "INVALID_INPUT");
    if (resource === "document") {
      if (request.method !== "GET")
        throw new ContractError(405, "Document reads require GET.", "INVALID_INPUT");
      operation = query.get("operation") ?? "read";
      if (operation === "source")
        return jsonResponse({
          revision: await runtime.documents.readBySource(scope.actorUserId, {
            repositoryId: scope.repository.id,
            fileId: string(query.get("fileId")),
            fileRevisionId: string(query.get("fileRevisionId")),
          }),
        });
      if (operation === "receipt")
        return jsonResponse({
          receipt: await runtime.documents.receipt(scope.actorUserId, {
            repositoryId: scope.repository.id,
            commandId: string(query.get("commandId")),
          }),
        });
      if (operation !== "read") invalid();
      return jsonResponse({
        revision: await runtime.documents.read(scope.actorUserId, {
          repositoryId: scope.repository.id,
          documentId: string(query.get("documentId")),
        }),
      });
    }
    const ctx = { actorUserId: scope.actorUserId, traceId };
    if (request.method === "GET") {
      operation = "status";
      return jsonResponse(
        await runtime.intake.status(ctx, {
          repositoryId: scope.repository.id,
          commandId: string(query.get("commandId")),
        }),
      );
    }
    if (!scope.canEdit || scope.archived)
      throw new ContractError(403, "目前沒有文件寫入權限。", "FORBIDDEN");
    const input = await body(request);
    operation = string(input.operation);
    if (input.repositoryId !== scope.repository.id) invalid("Repository scope mismatch.");
    const commandId = string(input.commandId);
    const repositoryId = scope.repository.id;
    if (operation === "resume") {
      exactFields(input, ["operation", "repositoryId", "commandId"]);
      return jsonResponse(await runtime.intake.resume(ctx, { repositoryId, commandId }));
    }
    if (operation !== "start") invalid();
    const source = record(input.source),
      target = record(input.target);
    exactFields(input, ["operation", "repositoryId", "commandId", "source", "target"]);
    exactFields(source, ["fileId", "fileRevisionId", "sha256"]);
    exactFields(target, ["documentId", "draftCommandId", "expectedDocumentVersion"]);
    if (
      typeof target.expectedDocumentVersion !== "number" ||
      !Number.isSafeInteger(target.expectedDocumentVersion) ||
      target.expectedDocumentVersion < 0 ||
      target.expectedDocumentVersion > 2147483646
    )
      invalid();
    return jsonResponse(
      await runtime.intake.start(ctx, {
        commandId,
        repositoryId,
        source: {
          fileId: string(source.fileId),
          fileRevisionId: string(source.fileRevisionId),
          sha256: string(source.sha256),
        },
        target: {
          documentId: string(target.documentId),
          draftCommandId: string(target.draftCommandId),
          expectedDocumentVersion: target.expectedDocumentVersion,
        },
      }),
    );
  } catch (error) {
    const known =
      error instanceof FileError ||
      error instanceof CommercialIntakeError ||
      error instanceof ContractError ||
      error instanceof RequestIdentityError ||
      error instanceof RepositoryError ||
      error instanceof UserError;
    const stage = error instanceof CommercialIntakeError ? error.stage : operation;
    const status = known ? error.status : 500;
    const code = known && "code" in error ? String(error.code) : "COMMERCIAL_REQUEST_FAILED";
    logServerError(error, {
      service: resource === "intake" ? "document-intakes-api" : "commercial-documents-api",
      operation: stage,
      status,
      code,
      traceId,
    });
    return jsonResponse(
      {
        error:
          error instanceof FileError
            ? "目前無法存取此解析來源，請重新登入或確認檔案授權後重試。"
            : status < 500 && known
              ? error.message
              : "商務文件操作失敗；請保留原命令，查詢狀態或聯絡管理員。",
        code,
        stage,
        traceId,
      },
      status,
    );
  }
}
