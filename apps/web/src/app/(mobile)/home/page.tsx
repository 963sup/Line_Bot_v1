import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
import HomeActions from "./home-actions";

export default function Page() {
  const liffId = lineMiniApp().liffId;

  return (
    <AppShell>
      <PageHeading title="Home" actions={<HomeActions liffId={liffId} />} />

      <div className="home-popular">
        <DiscoveryPanel liffId={liffId} sections="trending" variant="home" />
      </div>

      <div className="menu-group home-resource-list">
        <ActionRow href="/repositories" icon="□" tone="blue" title="Repositories" />
        <ActionRow href="/organizations" icon="▦" tone="orange" title="Organizations" />
        <ActionRow href="/stars" icon="★" tone="yellow" title="Starred" />
        <ActionRow href="/projects" icon="▤" title="Projects" />
      </div>

      <details className="more-tools home-more-tools">
        <summary>More</summary>
        <div className="menu-group">
          <ActionRow
            href="/issues"
            icon="◎"
            tone="blue"
            title="Issues"
            description="先選 Repository，再查看該範圍的 Issues"
          />
          <ActionRow
            href="/repositories?resource=discussions"
            icon="◌"
            tone="purple"
            title="Discussions"
            description="先選 Repository，再查看該範圍的 Discussions"
          />
          <ActionRow href="/daily-check-in" icon="◎" tone="green" title="Daily Check-in" />
          <ActionRow href="/attendance" icon="◷" tone="blue" title="Attendance" />
          <ActionRow href="/expenses" icon="$" tone="yellow" title="Expenses" />
          <ActionRow href="/diary" icon="□" title="Work Diary" />
          <ActionRow href="/history" icon="↺" title="History" description="工作與出勤紀錄" />
          <ActionRow href="/team" icon="◫" tone="purple" title="Teams" />
          <ActionRow href="/enterprises" icon="◇" tone="pink" title="Enterprise" />
          <ActionRow href="/partners" icon="◇" title="Partners" description="合作夥伴、消息與推薦" />
          <ActionRow href="/feedback" icon="!" title="Feedback" description="即時回饋入口" />
          <ActionRow href="/admin" icon="⌁" title="Admin" description="具管理責任時使用" />
        </div>
      </details>
    </AppShell>
  );
}
