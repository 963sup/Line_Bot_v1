import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="首頁"
        description="從目前可用的工作與資源開始；首頁只組裝各 owner 已存在的能力。"
      />

      <SectionHeading title="我的工作" description="高頻工作與資源入口。" />
      <div className="menu-group">
        <ActionRow href="/attendance" title="出勤" description="打卡、目前出勤狀態與工作場所" />
        <ActionRow href="/repositories" title="儲存庫" description="Issue 與 Repository 內工作資源" />
        <ActionRow href="/organizations" title="組織" description="Organization 與成員治理" />
        <ActionRow href="/enterprises" title="企業" description="Enterprise 與跨 Organization 治理" />
        <ActionRow href="/team" title="團隊" description="Organization-scoped Team 協作" />
      </div>

      <SectionHeading
        title="收藏"
        description="只顯示目前仍可存取、且由你 Star 的 Repository。"
      />
      <StarredRepositories liffId={lineMiniApp().liffId} />

      <SectionHeading title="快捷入口" description="既有能力的固定入口，不建立第二套捷徑資料。" />
      <div className="menu-group">
        <ActionRow href="/expenses" title="費用" description="費用紀錄與既有操作" />
        <ActionRow href="/history" title="工作紀錄" description="回看已完成的工作紀錄" />
        <ActionRow href="/feedback" title="即時回饋" description="查看目前可用的回饋方式" />
      </div>
    </AppShell>
  );
}
