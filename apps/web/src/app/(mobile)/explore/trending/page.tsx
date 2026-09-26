import DiscoveryPanel from "../../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Trending"
        description="最近 7 天的有效 Star 訊號優先；只顯示目前登入者有權查看的 Repository。"
        back="/explore"
      />
      <DiscoveryPanel liffId={lineMiniApp().liffId} showActivity={false} />
    </AppShell>
  );
}
