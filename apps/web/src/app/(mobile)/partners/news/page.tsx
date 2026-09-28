import PartnersPanel from "../../../../modules/partners/panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="最新消息" description="只顯示夥伴推薦成功後的更新。" back="/team" />
      <PartnersPanel liffId={lineMiniApp().liffId} mode="news" />
    </AppShell>
  );
}
