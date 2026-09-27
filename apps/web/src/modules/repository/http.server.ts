import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { UserError } from "@line-work/account/domain/user";
import { IssueError, normalizeRepositoryName, RepositoryError } from "@line-work/repository/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export function repositoryPathSelector(owner: string, repository: string) {
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(owner);
  } catch {
    throw new IssueError(400, "Repository owner login 不正確。");
  }
  const repositoryName = normalizeRepositoryName(repository);
  if (!repositoryName) throw new IssueError(400, "Repository name 不正確。");
  return { ownerLogin, repositoryName };
}

async function jsonObjectBody(
  request: Request,
  failure: (status: number, message: string) => Error,
): Promise<Record<string, unknown>> {
  const configured = process.env.APP_ORIGIN;
  if (
    !configured ||
    new URL(configured).origin !== configured ||
    !configured.startsWith("https://")
  ) {
    throw failure(503, "服務網址尚未設定。");
  }
  if (request.headers.get("origin") !== configured) {
    throw failure(403, "請從工作助手頁面操作。");
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw failure(415, "需要 JSON 格式。");
  }
  let text: string;
  try {
    text = await readBodyText(request, 8192);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw failure(413, "內容過大。");
    throw error;
  }
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw failure(400, "資料格式不正確。");
  }
}

export function issueBody(request: Request): Promise<Record<string, unknown>> {
  return jsonObjectBody(request, (status, message) => new IssueError(status, message));
}

export function repositoryBody(request: Request): Promise<Record<string, unknown>> {
  return jsonObjectBody(request, (status, message) => new RepositoryError(status, message));
}

export function issueFailure(error: unknown) {
  const known =
    error instanceof IssueError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "issues-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    { error: known ? error.message : "Issue 服務暫時不可用，請稍後重試。" },
    status,
  );
}

export function repositoryFailure(error: unknown) {
  const known =
    error instanceof RepositoryError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "repository-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    { error: known ? error.message : "Repository 服務暫時不可用，請稍後重試。" },
    status,
  );
}
