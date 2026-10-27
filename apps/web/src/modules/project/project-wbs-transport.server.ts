import { UserError } from "@line_bot_v1/account/domain/user";
import { isRecord } from "@line_bot_v1/platform/validation";
import { ProjectError } from "@line_bot_v1/project/domain";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export function projectWbsSelector(projectId: string) {
  const value = projectId.trim();
  if (!value || value.length > 128) throw new WbsError(400, "Project ID 不正確。");
  return { projectId: value };
}

export async function projectWbsBody(request: Request, maxBytes: number) {
  const configured = process.env.APP_ORIGIN;
  if (
    !configured ||
    new URL(configured).origin !== configured ||
    !configured.startsWith("https://")
  ) {
    throw new WbsError(503, "服務網址尚未設定。");
  }
  if (request.headers.get("origin") !== configured) {
    throw new WbsError(403, "請從Line_Bot_v1頁面操作。");
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new WbsError(415, "需要 JSON 格式。");
  }
  let text: string;
  try {
    text = await readBodyText(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new WbsError(413, "內容過大。");
    throw error;
  }
  try {
    const body: unknown = JSON.parse(text);
    if (!isRecord(body)) throw new Error();
    return body;
  } catch {
    throw new WbsError(400, "資料格式不正確。");
  }
}

export function projectWbsFailure(error: unknown) {
  const known =
    error instanceof WbsError ||
    error instanceof ProjectError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 500;
  captureHandledServerError(error, { service: "project-wbs-api", operation: "request", status });
  return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, status);
}
