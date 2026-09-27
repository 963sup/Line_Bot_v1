import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, SectionHeading, StatusRow } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Explore" />

      <SectionHeading title="Trending" />
      <StatusRow
        icon="↗"
        tone="pink"
        title="Trending"
        description="尚未建立具時間語意的 ranking signal，因此不把 Star 數量冒充 Trending。"
        status="Not active"
      />

      <SectionHeading
        title="Discover"
        description="瀏覽目前有權存取的 Repository；Star 只保存個人關注，不增加權限。"
      />
      <DiscoveryPanel liffId={lineMiniApp().liffId} />

      <SectionHeading title="Templates / Activity" />
      <div className="menu-group">
        <StatusRow
          icon="□"
          tone="purple"
          title="Templates"
          description="目前沒有 canonical Template owner 或可建立的 template contract。"
          status="Not active"
        />
        <StatusRow
          icon="≋"
          tone="blue"
          title="Activity"
          description="目前沒有跨 owner 的 discovery activity feed contract。"
          status="Not active"
        />
      </div>
    </AppShell>
  );
}
