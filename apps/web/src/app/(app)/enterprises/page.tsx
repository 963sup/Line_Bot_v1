import EnterprisePanel from "../../../modules/enterprise/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="企業管理"
        description="建立、查看與治理 Enterprise；停用、退出與關係操作依目前責任顯示。"
        back="/settings"
      />
      <EnterprisePanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
