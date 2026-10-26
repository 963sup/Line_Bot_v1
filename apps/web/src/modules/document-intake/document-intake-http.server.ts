import { UserError } from "@line_bot_v1/account/domain/user";
import type { ContractDocumentIntake } from "@line_bot_v1/contract/contracts/input/document-intake";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import {
  type IntakeCommand,
  IntakeError,
} from "@line_bot_v1/intelligence/contracts/output/document-intake";
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
type Intake = (actor: string, input: IntakeCommand) => Promise<unknown>;

export type DocumentIntakeWebRuntime = {
  scope(subject: string, selector: { ownerLogin: string; repositoryName: string }): Promise<Scope>;
  intake: Intake | null;
  documents: ContractDocumentIntake | null;
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

async function jsonBody(request: Request): Promise<unknown> {
  const origin = process.env.APP_ORIGIN;
  if (!origin || !origin.startsWith("https://") || new URL(origin).origin !== origin)
    throw new ContractError(503, "Service origin is unavailable.", "UNAVAILABLE");
  if (request.headers.get("origin") !== origin)
    throw new ContractError(403, "Use the Line_Bot_v1 application.", "FORBIDDEN");
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw new ContractError(415, "JSON is required.", "INVALID_INPUT");
  try {
    return JSON.parse(await readBodyText(request, 524_288));
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      throw new ContractError(413, "Content is too large.", "INVALID_INPUT");
    throw new ContractError(400, "Invalid JSON body.", "INVALID_INPUT");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new ContractError(400, "Document intake command is required.", "INVALID_INPUT");
  return value;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0)
    throw new ContractError(400, `${field} is required.`, "INVALID_INPUT");
  return value;
}

function requiredInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new ContractError(400, `${field} must be a non-negative integer.`, "INVALID_INPUT");
  return value;
}

function parseIntakeCommand(value: unknown): IntakeCommand {
  const input = record(value);
  if (input.action !== "save")
    throw new ContractError(400, "Only document save intake is supported.", "INVALID_INPUT");
  const source = record(input.source);
  return {
    action: "save",
    repositoryId: requiredString(input.repositoryId, "repositoryId"),
    documentId: requiredString(input.documentId, "documentId"),
    requestId: requiredString(input.requestId, "requestId"),
    expectedVersion: requiredInteger(input.expectedVersion, "expectedVersion"),
    source: {
      fileId: requiredString(source.fileId, "source.fileId"),
      fileRevisionId: requiredString(source.fileRevisionId, "source.fileRevisionId"),
      fileSha256: requiredString(source.fileSha256, "source.fileSha256"),
    },
  };
}

function failure(error: unknown) {
  const known =
    error instanceof ContractError ||
    error instanceof IntakeError ||
    error instanceof RepositoryError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "repository-document-intake-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: known ? error.message : "Document intake service is unavailable.",
      ...(error instanceof ContractError || error instanceof IntakeError
        ? { code: error.code }
        : {}),
    },
    status,
  );
}

export async function documentIntakeRequest(
  request: Request,
  runtime: DocumentIntakeWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    const query = new URL(request.url).searchParams;
    const scope = await runtime.scope(subject, selector(query));
    const operation = query.get("operation") ?? (request.method === "POST" ? "intake" : "read");
    if (operation === "intake") {
      if (request.method !== "POST")
        throw new ContractError(405, "Document intake requires POST.", "INVALID_INPUT");
      if (!scope.canEdit || scope.archived)
        throw new ContractError(403, "目前沒有此 Repository 的文件寫入權限。", "FORBIDDEN");
      if (!runtime.intake)
        throw new ContractError(
          503,
          "採購單 AI 服務尚未設定，請聯絡系統管理員。",
          "UNAVAILABLE",
        );
      const command = parseIntakeCommand(await jsonBody(request));
      if (command.repositoryId !== scope.repository.id)
        throw new ContractError(
          400,
          "Document intake scope does not match the URL.",
          "INVALID_INPUT",
        );
      return jsonResponse(await runtime.intake(scope.actorUserId, command));
    }
    if (!runtime.documents)
      throw new ContractError(
        503,
        "採購單 AI 服務尚未設定，請聯絡系統管理員。",
        "UNAVAILABLE",
      );
    const documentId = query.get("documentId") ?? "";
    if (!documentId) throw new ContractError(400, "Document ID is required.", "INVALID_INPUT");
    if (operation === "receipt") {
      const requestId = query.get("requestId") ?? "";
      return jsonResponse(
        await runtime.documents.receipt(scope.actorUserId, {
          repositoryId: scope.repository.id,
          documentId,
          requestId,
        }),
      );
    }
    if (operation === "contract") {
      if (request.method !== "POST")
        throw new ContractError(405, "Contract document review requires POST.", "INVALID_INPUT");
      if (!scope.canEdit || scope.archived)
        throw new ContractError(403, "目前沒有此 Repository 的文件寫入權限。", "FORBIDDEN");
      const command = record(await jsonBody(request));
      if (command.repositoryId !== scope.repository.id)
        throw new ContractError(
          400,
          "Contract document scope does not match the URL.",
          "INVALID_INPUT",
        );
      return jsonResponse(await runtime.documents.submit(scope.actorUserId, command));
    }
    if (operation === "read")
      return jsonResponse({
        revision: await runtime.documents.read(scope.actorUserId, {
          repositoryId: scope.repository.id,
          documentId,
          ...(query.has("revisionId") ? { revisionId: query.get("revisionId") ?? "" } : {}),
        }),
      });
    throw new ContractError(400, "Unknown document intake operation.", "INVALID_INPUT");
  } catch (error) {
    return failure(error);
  }
}
