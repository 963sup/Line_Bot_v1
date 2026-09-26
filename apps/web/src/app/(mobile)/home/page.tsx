import MemberAvatar from "../../../modules/account/member-avatar";
import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default function Page() {
  const liffId = lineMiniApp().liffId;

  return (
    <AppShell>
      <PageHeading title="Home" actions={<MemberAvatar liffId={liffId} />} />

      <SectionHeading title="My Work" />
      <div className="menu-group home-resource-list">
        <ActionRow
          href="/repositories"
          icon="□"
          tone="blue"
          title="Repositories"
          description="工作內容、權限與資源的獨立容器"
        />
        <ActionRow
          href="#starred"
          icon="★"
          tone="yellow"
          title="Starred"
          description="你已 Star 且目前仍可存取的 Repository"
        />
      </div>

      <div id="starred" className="home-section-anchor">
        <SectionHeading title="Starred" description="你已 Star 且目前仍可存取的 Repository。" />
        <StarredRepositories liffId={liffId} />
      </div>

      <SectionHeading title="Operations" />
      <div className="menu-group">
        <ActionRow href="/attendance" icon="◷" tone="blue" title="Attendance" />
        <ActionRow href="/expenses" icon="$" tone="yellow" title="Expenses" />
        <ActionRow href="/diary" icon="□" title="Work Diary" />
        <ActionRow href="/history" icon="↺" title="History" description="工作與出勤紀錄" />
        <ActionRow href="/feedback" icon="!" title="Feedback" description="即時回饋入口" />
        <ActionRow href="/partners" icon="◇" title="Partners" description="合作夥伴、消息與推薦" />
      </div>

      <SectionHeading title="Governance" />
      <div className="menu-group">
        <ActionRow href="/organizations" icon="▦" tone="orange" title="Organizations" />
        <ActionRow href="/team" icon="◫" tone="purple" title="Teams" />
        <ActionRow href="/enterprises" icon="◇" tone="pink" title="Enterprise" />
        <ActionRow href="/admin" icon="⌁" title="Admin" description="具管理責任時使用" />
      </div>

      <SectionHeading title="Account" />
      <div className="menu-group">
        <ActionRow
          href="/settings"
          icon="◎"
          title="Settings"
          description="個人資料、帳號連線與權限設定"
        />
      </div>
    </AppShell>
  );
}
