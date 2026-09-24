import { attendanceCommand } from "../../../../modules/attendance/command.server";
import { clockAttendance, syncMemberAttendance } from "../../_composition/attendance.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return attendanceCommand(request, clockAttendance.clockIn, syncMemberAttendance, () =>
    requestLineIdentity(request),
  );
}
