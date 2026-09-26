import RepositoryStarListCreate from "../../../../../modules/repository/star-list-create";
import { repositoryStarListsPath } from "../../../../../modules/repository/resource-navigation";
import { lineMiniApp } from "../../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../../shared/ui/page-layout";
import AppShell from "../../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="New List"
        description="建立 private List，再加入你目前已 Star 且可存取的 Repository。"
        back={repositoryStarListsPath()}
      />
      <RepositoryStarListCreate liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
