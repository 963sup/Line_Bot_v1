import PermissionsPanel from "../../../../modules/account/permissions-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
export const dynamic = "force-dynamic";
export default function Page() {
  return <PermissionsPanel liffId={lineMiniApp().liffId} />;
}
