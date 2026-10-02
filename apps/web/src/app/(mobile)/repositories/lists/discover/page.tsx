import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../../_shell/app-shell";
import AwesomeLists from "../../../../../modules/repository/awesome-lists";
import { repositoryStarListsPath } from "../../../../../modules/repository/resource-navigation";
import { PageHeading, PrimaryLink, SectionHeading } from "../../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Awesome Lists"
        description="探索公開 curated Lists；private Repository 只在你目前可讀時出現。"
        back="/explore"
        actions={
          <PrimaryLink href={repositoryStarListsPath()} tone="secondary">
            My Lists
          </PrimaryLink>
        }
      />
      <SectionHeading title="Curated Repositories" />
      <AwesomeLists liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
