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
          href="/trending"
          icon="↗"
          tone="orange"
          title="Trending Repositories"
          description="近期 Star 訊號優先的 Repository discovery"
        />
        <ActionRow
          href="/repositories/lists/discover"
          icon="☺"
          tone="purple"
          title="Awesome Lists"
          description="探索公開 curated Repository Lists"
        />
      </div>
      <DiscoveryPanel liffId={lineMiniApp().liffId} sections="activity" />
    </AppShell>
  );
}
