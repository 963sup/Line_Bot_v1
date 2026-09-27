import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Stars"
        description="你已 Star 且目前仍可存取的 Repository。"
        back="/home"
      />
      <StarredRepositories liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
