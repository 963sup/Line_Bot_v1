import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../_shell/app-shell";
import {
  repositoryStarListCreatePath,
  repositoryStarListDiscoverPath,
} from "../../../../modules/repository/resource-navigation";
import RepositoryStarListCollection from "../../../../modules/repository/star-list-collection";
import { PageHeading, PrimaryLink, SectionHeading } from "../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Lists"
        description="整理你已 Star 的 Repository；List membership 不會增加 Repository 權限。"
        back="/home"
        actions={
          <div className="inline-actions">
            <PrimaryLink href={repositoryStarListDiscoverPath()} tone="secondary">
              Awesome Lists
            </PrimaryLink>
            <PrimaryLink href={repositoryStarListCreatePath()}>New List</PrimaryLink>
          </div>
        }
      />
      <SectionHeading title="My Lists" />
      <RepositoryStarListCollection liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
