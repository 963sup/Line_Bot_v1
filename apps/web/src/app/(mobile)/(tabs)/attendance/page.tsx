import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AttendancePanel from "../../../../modules/attendance/panel";

export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <>
      <AttendancePanel liffId={lineMiniApp().liffId} />
    </>
  );
}
