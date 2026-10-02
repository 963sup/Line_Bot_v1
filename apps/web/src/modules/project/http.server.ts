import { UserError } from "@line_bot_v1/account/domain/user";
import { ProjectError } from "@line_bot_v1/project/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import {
  BodyTooLargeError,
  jsonResponse,
  readBodyText,
} from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export async function projectBody(request: Request): Promise<Record<string, unknown>> {
  const configured = process.env.APP_ORIGIN;
  if (
    !configured ||
    new URL(configured).origin !== configured ||
    !configured.startsWith("https://")
  ) {
    throw new ProjectError(503, "服務網址尚未設定。");
  }
  if (request.headers.get("origin") !== configured) {
    throw new ProjectError(403, "請從Line_Bot_v1頁面操作。");
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new ProjectError(415, "需要 JSON 格式。");
  }
  let text: string;
  try {
    text = await readBodyText(request, 65_536);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      throw new ProjectError(413, "內容過大。");
    }
    throw error;
  }
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ProjectError(400, "資料格式不正確。");
  }
}

export function projectFailure(error: unknown) {
  const known =
    error instanceof ProjectError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? ((error as { status?: number }).status ?? 400) : 503;
  captureHandledServerError(error, {
    service: "project-api",
    operation: "request",
    status,
  });
  return jsonResponse(
    {
      error: known ? (error as Error).message : "Project 服務暫不可用，請稍後重試。",
      retryable: status >= 500 || status === 429,
    },
    status,
  );
}
