import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import PermissionsPanel from "../../../../../modules/account/permissions-panel";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PermissionsPanel liffId={lineMiniApp().liffId} manage />
    </>
  );
}
