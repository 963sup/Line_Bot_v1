import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
import HomeActions from "./home-actions";

function TargetRow({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="action-row action-row-disabled" aria-disabled="true">
      <span className="action-row-icon action-row-icon-neutral" aria-hidden="true">
        {icon}
      </span>
      <span className="action-row-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="action-row-status">未開放</span>
    </div>
  );
}

export default function Page() {
  const liffId = lineMiniApp().liffId;

  return (
    <AppShell>
      <PageHeading title="Home" actions={<HomeActions liffId={liffId} />} />

      <SectionHeading title="My Work" />
      <div className="menu-group home-resource-list">
        <ActionRow
          href="/repositories?resource=issues"
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
        <TargetRow icon="◇" title="Projects" description="跨 Repository 的規劃與管理功能尚未開放" />
        <ActionRow
          href="/repositories"
          icon="□"
          tone="blue"
          title="Repositories"
          description="目前登入者可存取的 Repository"
        />
        <ActionRow
          href="/organizations"
          icon="▦"
          tone="orange"
          title="Organizations"
          description="目前登入者可治理或參與的 Organization"
        />
        <ActionRow
          href="#favorites"
          icon="★"
          tone="yellow"
          title="Starred"
          description="你已 Star 且目前仍可存取的 Repository"
        />
      </div>

      <div id="favorites" className="home-section-anchor">
        <SectionHeading title="Favorites" description="你已 Star 且目前仍可存取的 Repository。" />
        <StarredRepositories liffId={liffId} />
      </div>

      <SectionHeading title="Shortcuts" description="常用工作入口。" />
      <div className="menu-group">
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

      <SectionHeading title="Recent" />
      <p className="empty-copy">Recent 功能尚未開放。</p>
    </AppShell>
  );
}
