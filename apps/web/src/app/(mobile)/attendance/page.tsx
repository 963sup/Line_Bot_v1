import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AttendancePanel from "../../../modules/attendance/panel";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <AttendancePanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
