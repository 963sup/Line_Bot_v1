import { repositoryStarListsPath } from "../../../../../modules/repository/resource-navigation";
import RepositoryStarListDetail from "../../../../../modules/repository/star-list-detail";
import { lineMiniApp } from "../../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../../shared/ui/page-layout";
import AppShell from "../../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  return (
    <AppShell>
      <PageHeading title="List" back={repositoryStarListsPath()} />
      <RepositoryStarListDetail liffId={lineMiniApp().liffId} listId={listId} />
    </AppShell>
  );
}
