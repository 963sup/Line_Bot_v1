import type { createClockAttendance } from "@line-work/attendance/application/clock";
import { AttendanceError } from "@line-work/attendance/domain";
import { jsonResponse } from "../../shared/server/http";
import { attendanceApiError, readAttendanceJsonBody } from "./http.server";

export async function attendanceCommand(
  request: Request,
  command: ReturnType<typeof createClockAttendance>["clockIn"],
  syncMemberAttendance: (subject: string) => Promise<unknown>,
  requestIdentity: () => Promise<string>,
) {
  try {
    const body = await readAttendanceJsonBody(request);
    const subject = await requestIdentity();
    if (
      Object.keys(body).some((key) => !["requestId", "expectedVersion", "location"].includes(key))
    )
      throw new AttendanceError(400, "出勤 API 含不支援的欄位。");
    if (typeof body.requestId !== "string" || typeof body.expectedVersion !== "number")
      throw new AttendanceError(400, "請重新整理出勤狀態後操作。");
    const result = await command(subject, {
      requestId: body.requestId,
      expectedVersion: body.expectedVersion,
      location: body.location,
    });
    await syncMemberAttendance(subject).catch(() => {});
    if (new URL(request.url).searchParams.get("view") === "clock") {
      const record = result.attendance.active ?? result.attendance.records.at(-1);
      return jsonResponse({
        version: result.version,
        at: record?.endedAt ?? record?.startedAt,
        credited: result.credited,
        replayed: result.replayed,
      });
    }
    return jsonResponse(result);
  } catch (error) {
    return attendanceApiError(error);
  }
}
