import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Home" />

      <SectionHeading title="My Work" />
      <div className="menu-group home-resource-list">
        <ActionRow href="/repositories" icon="●" tone="green" title="Repositories & Issues" />
        <ActionRow href="/organizations" icon="▦" tone="orange" title="Organizations" />
        <ActionRow href="/team" icon="◫" tone="purple" title="Teams" />
        <ActionRow href="/attendance" icon="◷" tone="blue" title="Attendance" />
        <ActionRow href="/expenses" icon="$" tone="yellow" title="Expenses" />
        <ActionRow href="/enterprises" icon="◇" tone="pink" title="Enterprise" />
      </div>

      <SectionHeading title="Favorites" description="你已 Star 且目前仍可存取的 Repository。" />
      <StarredRepositories liffId={lineMiniApp().liffId} />

      <SectionHeading
        title="Shortcuts"
        description="固定入口只組裝既有能力；目前不建立第二套可儲存 Shortcut truth。"
      />
      <div className="menu-group">
        <ActionRow href="/history" icon="↺" title="History" description="工作與出勤紀錄" />
        <ActionRow href="/feedback" icon="!" title="Feedback" description="即時回饋入口" />
        <ActionRow href="/settings" icon="◎" title="Profile" description="個人資料與設定" />
      </div>
    </AppShell>
  );
}
