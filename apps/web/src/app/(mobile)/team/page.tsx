import TeamPanel from "../../../modules/team/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="組織團隊"
        description="Organization Team 一定屬於 Organization；先選 Organization，再建立或選擇 Team。"
        back="/settings"
      />
      <TeamPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
