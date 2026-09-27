import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell activeHref="/explore">
      <PageHeading
        title="Trending"
        description="依最近 7 天有效 Star 訊號排序目前登入者仍可存取的 Repository。"
        back="/explore"
      />
      <div className="trending-filters" aria-label="Trending filters">
        <span>最近 7 天</span>
        <span>目前可存取</span>
      </div>
      <DiscoveryPanel liffId={lineMiniApp().liffId} sections="trending" />
    </AppShell>
  );
}
