import PartnersPanel from "../../../../modules/partners/panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="夥伴推薦"
        description="推薦新的合作夥伴窗口，成功後更新通訊錄與最新消息。"
        back="/team"
      />
      <PartnersPanel liffId={lineMiniApp().liffId} mode="referrals" />
    </AppShell>
  );
}
