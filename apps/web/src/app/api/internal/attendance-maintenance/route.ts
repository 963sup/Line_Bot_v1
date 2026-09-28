import { createHash, timingSafeEqual } from "node:crypto";
import { captureHandledServerError } from "../../../../shared/observability/server-error";
import { jsonResponse } from "../../../../shared/server/http";
import { attendanceMaintenance } from "../../_composition/attendance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request) {
  const secret = process.env.ATTENDANCE_WORKER_SECRET;
  if (!secret || secret.length < 32) return 503;
  const actual = createHash("sha256")
    .update(request.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(actual, expected) ? 204 : 401;
}

/** Read-only deployment/credential preflight for the scheduler reconciler. */
export async function GET(request: Request) {
  const status = authorize(request);
  if (status === 204)
    return new Response(null, { status, headers: { "cache-control": "no-store" } });
  return jsonResponse({ error: status === 503 ? "排程服務尚未設定。" : "未授權。" }, status);
}

export async function POST(request: Request) {
  const status = authorize(request);
  if (status !== 204)
    return jsonResponse({ error: status === 503 ? "排程服務尚未設定。" : "未授權。" }, status);
  try {
    return jsonResponse(await attendanceMaintenance());
  } catch (error) {
    captureHandledServerError(error, {
      service: "attendance-maintenance",
      operation: "run",
      status: 503,
    });
    return jsonResponse({ error: "出勤同步暫時無法完成。" }, 503);
  }
}
