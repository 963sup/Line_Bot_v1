import MembershipSetup from "../../../../modules/account/setup-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../../(app)/_shell/app-shell";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <MembershipSetup liffId={lineMiniApp().liffId} intent="register" />
    </AppShell>
  );
}
