import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../../_shell/app-shell";
import { repositoryStarListsPath } from "../../../../../modules/repository/resource-navigation";
import RepositoryStarListCreate from "../../../../../modules/repository/star-list-create";
import { PageHeading } from "../../../../../shared/ui/page-layout";

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
