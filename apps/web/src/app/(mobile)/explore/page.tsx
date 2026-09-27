import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Explore" />
      <SectionHeading title="Discover" />
      <div className="menu-group explore-discover">
        <ActionRow
          href="#trending"
          icon="↗"
          tone="orange"
          title="Trending Repositories"
          description="近期 Star 訊號優先的 Repository discovery"
        />
        <ActionRow
          href="/search"
          icon="⌕"
          tone="purple"
          title="Search Repositories"
          description="搜尋目前有權存取的 Repository"
        />
      </div>
      <DiscoveryPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
