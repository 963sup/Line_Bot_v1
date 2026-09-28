import PartnersPanel from "../../../modules/partners/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="合作夥伴" description="查找已發布的夥伴窗口與聯繫方式。" back="/team" />
      <PartnersPanel liffId={lineMiniApp().liffId} mode="directory" />
    </AppShell>
  );
}
