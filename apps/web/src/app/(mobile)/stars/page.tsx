import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { PageHeading, PrimaryLink } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Starred Repositories" back="/home" />
      <div className="starred-list-tools">
        <PrimaryLink href="/repositories/lists" tone="secondary">
          My lists
        </PrimaryLink>
        <PrimaryLink href="/repositories/lists/new">+ NEW</PrimaryLink>
      </div>
      <StarredRepositories liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
