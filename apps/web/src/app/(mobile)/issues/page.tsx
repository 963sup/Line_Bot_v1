import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import RepositoryList from "../../../modules/repository/repository-list";
import { PageHeading } from "../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Issues" back="/home" />
      <RepositoryList liffId={lineMiniApp().liffId} intent="browse-issues" />
    </AppShell>
  );
}
