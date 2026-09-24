import type { createWorkplaces } from "@line-work/attendance/application/workplaces";
import { jsonResponse } from "../../shared/server/http";
import { attendanceApiError, readAttendanceJsonBody } from "./http.server";

export async function workplaceRequest(
  request: Request,
  dependencies: {
    workplaces: ReturnType<typeof createWorkplaces>;
    requestIdentity: () => Promise<string>;
  },
) {
  try {
    const subject = await dependencies.requestIdentity();
    if (request.method === "POST")
      return jsonResponse(
        await dependencies.workplaces.change(subject, await readAttendanceJsonBody(request, 4096)),
      );
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await dependencies.workplaces.read(
        subject,
        params.get("id") ?? "",
        params.get("after") ?? "",
      ),
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
