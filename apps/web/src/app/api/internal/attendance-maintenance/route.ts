import { createHash, timingSafeEqual } from "node:crypto";
import { captureHandledServerError } from "../../../../shared/observability/server-error";
import { jsonResponse } from "../../../../shared/server/http";
import { attendanceMaintenance } from "../../_composition/attendance.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.ATTENDANCE_WORKER_SECRET;
  if (!secret || secret.length < 32) return jsonResponse({ error: "排程服務尚未設定。" }, 503);
  const actual = createHash("sha256")
    .update(request.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  if (!timingSafeEqual(actual, expected)) return jsonResponse({ error: "未授權。" }, 401);
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
