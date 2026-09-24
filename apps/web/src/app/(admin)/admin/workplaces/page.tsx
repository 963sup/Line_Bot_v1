import WorkplacesPanel from "../../../../modules/attendance/workplaces-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
export const dynamic = "force-dynamic";
export default function Page() {
  return <WorkplacesPanel liffId={lineMiniApp().liffId} />;
}
