import RepositoryList from "../../../modules/repository/repository-list";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, PrimaryLink } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Repositories"
        description="目前登入者可存取的工作容器；進入後再查看該 Repository 的 Issues、Discussions、Labels 與 Milestones。"
        actions={<PrimaryLink href="/explore">Explore</PrimaryLink>}
      />
      <RepositoryList liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
