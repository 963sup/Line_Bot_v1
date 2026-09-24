import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Explore" />
      <SectionHeading
        title="Discover"
        description="瀏覽目前有權存取的 Repository；Star 只保存個人關注，不增加權限。"
      />
      <DiscoveryPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
