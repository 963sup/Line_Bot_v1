import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import RepositoryCreate from "../../../../modules/repository/repository-create";
import { PageHeading } from "../../../../shared/ui/page-layout";
import AppShell from "../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="New Repository"
        description="建立 private Repository；Personal owner 為目前 User，Organization owner 需要 current OrganizationOwner。"
        back="/repositories"
      />
      <RepositoryCreate liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
