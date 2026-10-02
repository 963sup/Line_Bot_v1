import type { createRichMenuClient } from "@line_bot_v1/line/rich-menu";
import { menuAlias, SUBMENU_PAGES } from "./definition";

/** Preserve submenu browsing during maintenance; explicit Back uses current Attendance truth. */
export async function syncUserRichMenu(
  client: Pick<
    ReturnType<typeof createRichMenuClient>,
    "getUserMenu" | "get" | "getAlias" | "linkUser"
  >,
  subject: string,
  attendancePage: "attendance-in" | "attendance-out",
  returnToAttendance = false,
) {
  const current = await client.getUserMenu(subject);
  let page: Parameters<typeof menuAlias>[0] = attendancePage;
  if (current && !returnToAttendance) {
    const definition = await client.get(current);
    if (definition && typeof definition === "object" && "name" in definition) {
      page =
        SUBMENU_PAGES.find((candidate) => definition.name === `Line_Bot_v1-${candidate}`) ?? page;
    }
  }
  const target = await client.getAlias(menuAlias(page));
  if (!target) throw new Error("attendance_menu_not_configured");
  if (current === target) return;
  // A native switch while resolving the alias takes precedence over background reconciliation.
  if (!returnToAttendance && (await client.getUserMenu(subject)) !== current) {
    throw new Error("attendance_menu_navigation_changed");
  }
  await client.linkUser(subject, target);
  if ((await client.getUserMenu(subject)) !== target)
    throw new Error("attendance_menu_readback_mismatch");
}
