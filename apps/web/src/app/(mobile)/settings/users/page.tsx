import UserManagement from "../../../../modules/account/manage-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell navigation="secondary">
      <UserManagement liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
