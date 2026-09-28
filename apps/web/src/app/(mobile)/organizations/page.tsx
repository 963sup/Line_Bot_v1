import OrganizationPanel from "../../../modules/organization/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="組織管理"
        description="建立、查看與治理 Organization；成員、邀請與 Owner 責任集中在同一個詳情頁。"
        back="/home"
      />
      <OrganizationPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
