import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import EnterprisePanel from "../../../modules/enterprise/panel";
import { PageHeading } from "../../../shared/ui/page-layout";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="企業管理"
        description="建立、查看與治理 Enterprise；停用、退出與關係操作依目前責任顯示。"
        back="/home"
      />
      <EnterprisePanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
