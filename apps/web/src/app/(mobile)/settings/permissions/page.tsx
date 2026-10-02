import PermissionsPanel from "../../../../modules/account/permissions-panel";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell navigation="secondary">
      <PermissionsPanel liffId={lineMiniApp().liffId} manage />
    </AppShell>
  );
}
