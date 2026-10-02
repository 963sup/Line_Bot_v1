import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AutoClock from "../../../../modules/attendance/auto-clock";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AutoClock liffId={lineMiniApp().liffId} operation="clock-out" />;
}
