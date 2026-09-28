import UserManagement from "../../../../modules/account/manage-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";

export const dynamic = "force-dynamic";

export default function Page() {
  return <UserManagement liffId={lineMiniApp().liffId} />;
}
