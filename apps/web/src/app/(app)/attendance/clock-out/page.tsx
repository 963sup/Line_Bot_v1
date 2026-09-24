import AutoClock from "../../../../modules/attendance/auto-clock";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AutoClock liffId={lineMiniApp().liffId} operation="clock-out" />;
}
