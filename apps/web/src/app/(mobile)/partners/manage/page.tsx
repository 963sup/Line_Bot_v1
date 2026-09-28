import PartnerManagement from "../../../../modules/partners/manage-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell navigation="secondary">
      <PartnerManagement liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
