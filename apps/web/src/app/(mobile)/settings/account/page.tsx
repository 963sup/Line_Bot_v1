import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../_shell/app-shell";
import MemberPanel from "../../../../modules/account/panel";
import { PageHeading } from "../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  const miniApp = lineMiniApp();
  return (
    <AppShell navigation="secondary">
      <PageHeading
        title="Account & Connections"
        description="管理目前 User lifecycle、LINE 身分與選填的外部連線；工作權限仍由各 owner 決定。"
        back="/settings"
      />
      <MemberPanel liffId={miniApp.liffId} miniAppUrl={miniApp.url} />
    </AppShell>
  );
}
