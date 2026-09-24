import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="探索"
        description="全域探索入口；目前只呈現已完成的儲存庫探索能力。"
      />
      <SectionHeading
        title="儲存庫"
        description="瀏覽目前可存取的儲存庫，並用 Star 保存自己的關注。"
      />
      <DiscoveryPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
