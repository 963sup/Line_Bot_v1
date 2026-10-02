import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import PartnerManagement from "../../../../modules/partners/manage-panel";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell navigation="secondary">
      <PartnerManagement liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
