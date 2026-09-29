import { UserError } from "@line_bot_v1/account/domain/user";
import { attendanceClockReceipt } from "@line_bot_v1/attendance/contracts/dto/attendance-client";
import { parseAttendanceInput } from "@line_bot_v1/attendance/contracts/input/attendance-command";
import { AttendanceError } from "@line_bot_v1/attendance/domain/error";
import {
  type AttendanceAction,
  attendanceActionFromOperation,
} from "@line_bot_v1/attendance/domain/value-objects/attendance-action";
import { captureHandledServerError } from "../../../../shared/observability/server-error";
import { infrastructureFailureCode } from "../../../../shared/server/failure-code";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../../../../shared/server/http";
import { RequestIdentityError } from "../../../../shared/server/request-identity-error";
import { clockAttendance, syncMemberAttendance } from "../../_composition/attendance.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttendanceRoute = "root" | AttendanceAction | "unknown";

function attendanceRoute(request: Request): AttendanceRoute {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "attendance") return "unknown";
  if (segments.length === 2) return "root";
  if (segments.length !== 3) return "unknown";
  return attendanceActionFromOperation(segments[2]) ?? "unknown";
}

function methodNotAllowed(allow: "GET" | "POST") {
  return new Response(null, { status: 405, headers: { Allow: allow } });
}

function appOrigin() {
  const configured = process.env.APP_ORIGIN ?? "";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new AttendanceError(503, "會員網址尚未設定。");
  }
  if (url.protocol !== "https:" || url.origin !== configured)
    throw new AttendanceError(503, "會員網址必須是固定 HTTPS origin。");
  return configured;
}

async function readAttendanceJsonBody(request: Request, maxBytes = 2048): Promise<unknown> {
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
    return JSON.parse(text) as unknown;
  } catch {
    throw new AttendanceError(400, "資料格式不正確。");
  }
}

function attendanceApiError(error: unknown) {
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

export async function GET(request: Request) {
  const route = attendanceRoute(request);
  if (route === "unknown") return new Response(null, { status: 404 });
  if (route !== "root") return methodNotAllowed("POST");

  try {
    const subject = await requestLineIdentity(request);
    if (new URL(request.url).searchParams.get("view") === "clock")
      return jsonResponse(await clockAttendance.prepare(subject));
    return jsonResponse(await clockAttendance.get(subject));
  } catch (error) {
    return attendanceApiError(error);
  }
}

export async function POST(request: Request) {
  const route = attendanceRoute(request);
  if (route === "unknown") return new Response(null, { status: 404 });
  if (route === "root") return methodNotAllowed("GET");

  try {
    const input = parseAttendanceInput(await readAttendanceJsonBody(request));
    const subject = await requestLineIdentity(request);
    const result = await clockAttendance.execute(subject, route, input);
    await syncMemberAttendance(subject).catch(() => {});
    if (new URL(request.url).searchParams.get("view") === "clock")
      return jsonResponse(attendanceClockReceipt(result));
    return jsonResponse(result);
  } catch (error) {
    return attendanceApiError(error);
  }
}
