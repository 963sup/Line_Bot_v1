import RepositorySearch from "../../../modules/repository/repository-search";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Search"
        description="搜尋目前登入者可存取的 Repositories；不冒充尚未存在的跨資源搜尋。"
        back="/home"
      />
      <RepositorySearch liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
