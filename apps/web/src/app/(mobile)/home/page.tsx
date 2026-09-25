import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import {
  ActionRow,
  PageHeading,
  PageState,
  SectionHeading,
  StatusRow,
} from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default function Page() {
  return (
    <AppShell>
      <PageHeading title="Home" />

      <SectionHeading title="My Work" />
      <div className="menu-group home-resource-list">
        <ActionRow
          href="/repositories"
          icon="●"
          tone="green"
          title="Issues"
          description="查看目前可存取 Repository 的工作項目"
        />
        <ActionRow
          href="/repositories"
          icon="◫"
          tone="purple"
          title="Discussions"
          description="進入 Repository 的討論與協作"
        />
        <StatusRow
          icon="▦"
          tone="orange"
          title="Projects"
          description="Project 規劃資料已建立；互動功能尚未開放。"
          status="Data only"
        />
        <ActionRow
          href="/repositories"
          icon="□"
          tone="blue"
          title="Repositories"
          description="工作內容與權限的獨立容器"
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
        <StarredRepositories liffId={lineMiniApp().liffId} />
      </div>

      <SectionHeading
        title="Shortcuts"
        description="固定入口只組裝既有能力；目前不建立第二套可儲存 Shortcut truth。"
      />
      <div className="menu-group">
        <ActionRow href="/attendance" icon="◷" tone="blue" title="Attendance" />
        <ActionRow href="/expenses" icon="$" tone="yellow" title="Expenses" />
        <ActionRow href="/organizations" icon="▦" tone="orange" title="Organizations" />
        <ActionRow href="/team" icon="◫" tone="purple" title="Teams" />
        <ActionRow href="/enterprises" icon="◇" tone="pink" title="Enterprise" />
        <ActionRow href="/history" icon="↺" title="History" description="工作與出勤紀錄" />
        <ActionRow href="/feedback" icon="!" title="Feedback" description="即時回饋入口" />
        <ActionRow
          href="/settings"
          icon="◎"
          title="Settings"
          description="個人資料、連線與權限設定"
        />
      </div>

      <SectionHeading title="Recent" />
      <PageState title="目前沒有可顯示的最近項目">
        Recent 會在存在可信、跨功能的活動來源後顯示；目前不以瀏覽器狀態推測工作紀錄。
      </PageState>
    </AppShell>
  );
}
