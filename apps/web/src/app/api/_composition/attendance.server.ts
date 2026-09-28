import { createClockAttendance } from "@line_bot_v1/attendance/application/clock";
import { createAttendanceMaintenance } from "@line_bot_v1/attendance/application/maintenance";
import { PostgresAttendanceStore } from "@line_bot_v1/attendance/postgres";
import { createRichMenuClient, pushLineText } from "@line_bot_v1/line-channel/messaging";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line-channel/provider";
import { syncUserRichMenu } from "../../../modules/assistant/rich-menu/user-menu.server";
import { attendanceNotificationText } from "../../../modules/attendance/format";
import { activeLineUser } from "./account.server";

const state = globalThis as typeof globalThis & { attendanceStore?: PostgresAttendanceStore };
function attendanceStore() {
  return (state.attendanceStore ??= new PostgresAttendanceStore());
}

export const clockAttendance = createClockAttendance({
  activeUser: activeLineUser,
  store: attendanceStore,
  now: () => Date.now(),
  provider: () => LINE_PROVIDER_NAMESPACE,
});

function runMaintenance(subject?: string, returnToAttendance = false) {
  return createAttendanceMaintenance({
    store: attendanceStore,
    now: () => Date.now(),
    provider: () => LINE_PROVIDER_NAMESPACE,
    link: async (subject, state) => {
      const client = createRichMenuClient(process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "");
      await syncUserRichMenu(
        client,
        subject,
        state === "working" ? "attendance-out" : "attendance-in",
        returnToAttendance,
      );
    },
    notify: (job) =>
      pushLineText(
        process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
        job.subject,
        attendanceNotificationText(job.payload),
        job.id,
      ),
  })(subject, !returnToAttendance);
}

export async function attendanceMaintenance(subject?: string) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("line_not_configured");
  return runMaintenance(subject);
}

export async function syncMemberAttendance(subject: string) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) return;
  return attendanceMaintenance(subject);
}

/** Private-chat menu navigation re-reads the member's authoritative state. */
export async function showAttendanceMenu(subject: string) {
  await attendanceStore().refreshMenu(LINE_PROVIDER_NAMESPACE, subject, Date.now());
  const result = await runMaintenance(subject, true);
  if (!result.synced) throw new Error("attendance_menu_sync_pending");
}
