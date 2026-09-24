import {
  PostgresAttendanceStore,
  PostgresWorkplaceStore,
} from "@line-work/attendance/adapters/postgres";
import { createClockAttendance } from "@line-work/attendance/application/clock";
import { createAttendanceMaintenance } from "@line-work/attendance/application/maintenance";
import { createWorkplaces } from "@line-work/attendance/application/workplaces";
import { createRichMenuClient, pushLineText } from "@line-work/line-channel/adapters/messaging";
import { LINE_PROVIDER_NAMESPACE } from "@line-work/line-channel/provider";
import { menuAlias } from "../../../modules/assistant/rich-menu/definition";
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

const runMaintenance = createAttendanceMaintenance({
  store: attendanceStore,
  now: () => Date.now(),
  provider: () => LINE_PROVIDER_NAMESPACE,
  link: async (subject, state) => {
    const client = createRichMenuClient(process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "");
    const id = await client.getAlias(
      menuAlias(state === "working" ? "attendance-out" : "attendance-in"),
    );
    if (!id) throw new Error("attendance_menu_not_configured");
    await client.linkUser(subject, id);
    if ((await client.getUserMenu(subject)) !== id)
      throw new Error("attendance_menu_readback_mismatch");
  },
  notify: (job) =>
    pushLineText(
      process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
      job.subject,
      attendanceNotificationText(job.payload),
      job.id,
    ),
});

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
  const result = await runMaintenance(subject, false);
  if (!result.synced) throw new Error("attendance_menu_sync_pending");
}

export const workplaces = createWorkplaces({
  activeUser: activeLineUser,
  store: () => new PostgresWorkplaceStore(),
  now: () => Date.now(),
});
