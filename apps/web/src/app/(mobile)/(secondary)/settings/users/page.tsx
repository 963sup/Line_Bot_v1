import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import UserManagement from "../../../../../modules/account/manage-panel";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <UserManagement liffId={lineMiniApp().liffId} />
    </>
  );
}
