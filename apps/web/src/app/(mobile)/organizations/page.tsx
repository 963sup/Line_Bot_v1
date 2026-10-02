import OrganizationPanel from "../../../modules/organization/panel";
import { lineMiniApp } from "@line_bot_v1/line-channel/mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Organizations" back="/home" />
      <OrganizationPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
