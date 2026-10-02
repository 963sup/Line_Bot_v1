import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../_shell/app-shell";
import UserManagement from "../../../../modules/account/manage-panel";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell navigation="secondary">
      <UserManagement liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
