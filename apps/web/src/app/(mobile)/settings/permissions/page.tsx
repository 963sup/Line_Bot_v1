import PermissionsPanel from "../../../../modules/account/permissions-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PermissionsPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
