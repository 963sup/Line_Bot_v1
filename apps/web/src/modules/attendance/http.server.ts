import { UserError } from "@line-work/account/domain/user";
import { AttendanceError } from "@line-work/attendance/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { infrastructureFailureCode } from "../../shared/server/failure-code";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

function appOrigin() {
  const configured = process.env.APP_ORIGIN ?? "";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new AttendanceError(503, "會員網址尚未設定。");
  }
  if (url.protocol !== "https:" || url.origin !== configured) {
    throw new AttendanceError(503, "會員網址必須是固定 HTTPS origin。");
  }
  return configured;
}

export async function readAttendanceJsonBody(
  request: Request,
  maxBytes = 2048,
): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== appOrigin())
    throw new AttendanceError(403, "來源不符，請重新開啟會員頁。");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AttendanceError(415, "資料格式不正確。");

  let text: string;
  try {
    text = await readBodyText(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new AttendanceError(413, "資料過大。");
    throw error;
  }

  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new AttendanceError(400, "資料格式不正確。");
  }
}

export function attendanceApiError(error: unknown) {
  const known =
    error instanceof AttendanceError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "attendance-api",
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
        status,
      )
    : jsonResponse(
        {
          error: `會員服務暫不可用（錯誤代碼：${infrastructureFailureCode(error)}）。請稍後重試。`,
          code,
          retryable: true,
        },
        503,
      );
}
