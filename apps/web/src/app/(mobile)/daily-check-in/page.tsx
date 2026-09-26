import DailyCheckInPanel from "../../../modules/daily-check-in/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="Daily Check-in"
        description="每日獎勵由 DailyCheckIn owner 決定；轉盤只呈現 server 已提交的結果。"
        back="/home"
      />
      <DailyCheckInPanel liffId={lineMiniApp().liffId} />
    </AppShell>
  );
}
