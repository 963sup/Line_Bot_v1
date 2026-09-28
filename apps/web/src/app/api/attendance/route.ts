import { attendanceApiError } from "../../../modules/attendance/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { clockAttendance } from "../_composition/attendance.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const subject = await requestLineIdentity(request);
    if (new URL(request.url).searchParams.get("view") === "clock")
      return jsonResponse(await clockAttendance.prepare(subject));
    const result = await clockAttendance.get(subject);
    return jsonResponse(result);
  } catch (error) {
    return attendanceApiError(error);
  }
}
