import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import AttendancePanel from "../../../modules/attendance/panel";

export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <AttendancePanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
