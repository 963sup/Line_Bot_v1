import { UserError } from "@line-work/account/domain/user";
import { DailyCheckInError } from "@line-work/daily-check-in/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";
import { membershipFailureCode } from "./failure-code.server";

/** 驗證固定 HTTPS APP Origin，防止跨站或代理偽造 */
function appOrigin() {
  const configured = process.env.APP_ORIGIN ?? "";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new UserError(503, "會員網址尚未設定。");
  }
  if (url.protocol !== "https:" || url.origin !== configured) {
    throw new UserError(503, "會員網址必須是固定 HTTPS origin。");
  }
  return configured;
}

/** Existing HTTP error contract shared by membership and attendance. */
export function apiError(error: unknown) {
  const known =
    error instanceof UserError ||
    error instanceof RequestIdentityError ||
    error instanceof DailyCheckInError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "account-api",
    operation: "request",
    status,
  });
  const code =
    status === 401
      ? "session_expired"
      : status === 403
        ? "membership_denied"
        : status === 409
          ? "operation_conflict"
          : status === 429
            ? "rate_limited"
            : status >= 500
              ? "service_unavailable"
              : "invalid_request";
  return known
    ? jsonResponse(
        { error: error.message, code, retryable: status === 429 || status >= 500 },
        error.status,
      )
    : jsonResponse(
        {
          error: `會員服務暫不可用（錯誤代碼：${membershipFailureCode(error)}）。請稍後重試。`,
          code,
          retryable: true,
        },
        503,
      );
}

/**
 * Read a bounded JSON object for the existing membership and attendance endpoints.
 *
 * 物理邊界檢查：
 * 1. 嚴格比對 Origin 標頭。
 * 2. 嚴格要求 application/json。
 * 3. 預設 2KB 串流讀取上限，特定表單可指定自己的有限上限。
 */
export async function readJsonBody(
  request: Request,
  maxBytes = 2048,
): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== appOrigin())
    throw new UserError(403, "來源不符，請重新開啟會員頁。");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new UserError(415, "資料格式不正確。");

  let text: string;
  try {
    text = await readBodyText(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new UserError(413, "資料過大。");
    throw error;
  }

  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new UserError(400, "資料格式不正確。");
  }
}
