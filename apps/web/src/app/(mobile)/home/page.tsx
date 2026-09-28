import DiscoveryPanel from "../../../modules/repository/discovery-panel";
import StarredRepositories from "../../../modules/repository/starred-repositories";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";
import HomeActions from "./home-actions";

export default function Page() {
  const liffId = lineMiniApp().liffId;

  return (
    <AppShell>
      <header className="home-toolbar">
        <PageHeading title="Home" actions={<HomeActions liffId={liffId} />} />
      </header>

      <section className="home-work" aria-labelledby="my-work-heading">
        <h2 id="my-work-heading">My Work</h2>
        <div className="menu-group home-resource-list">
          <ActionRow href="/issues" icon="◎" tone="green" title="Issues" />
          <ActionRow
            href="/repositories?resource=discussions"
            icon="◌"
            tone="purple"
            title="Discussions"
          />
          <ActionRow href="/projects" icon="▤" title="Projects" />
          <ActionRow href="/repositories" icon="□" tone="blue" title="Repositories" />
          <ActionRow href="/organizations" icon="▦" tone="orange" title="Organizations" />
          <ActionRow href="/stars" icon="★" tone="yellow" title="Starred" />
        </div>
      </section>

      <section className="home-section home-starred" aria-labelledby="home-starred-heading">
        <h2 id="home-starred-heading">Starred repositories</h2>
        <StarredRepositories liffId={liffId} />
      </section>

      <section className="home-section" aria-labelledby="home-shortcuts-heading">
        <h2 id="home-shortcuts-heading">Shortcuts</h2>
        <div className="home-shortcuts">
          <ActionRow href="/daily-check-in" icon="◎" tone="green" title="Daily Check-in" />
          <ActionRow href="/attendance" icon="◷" tone="blue" title="Attendance" />
          <ActionRow href="/expenses" icon="$" tone="yellow" title="Expenses" />
          <ActionRow href="/history" icon="↺" title="History" />
        </div>

        <details className="more-tools home-more-tools">
          <summary>More</summary>
          <div className="menu-group">
            <ActionRow href="/diary" icon="□" title="Work Diary" />
            <ActionRow href="/team" icon="◫" tone="purple" title="Teams" />
            <ActionRow href="/enterprises" icon="◇" tone="pink" title="Enterprise" />
            <ActionRow
              href="/partners"
              icon="◇"
              title="Partners"
              description="合作夥伴、消息與推薦"
            />
            <ActionRow href="/feedback" icon="!" title="Feedback" description="即時回饋入口" />
          </div>
        </details>
      </section>

      <section className="home-section home-recent" aria-label="Recent repository activity">
        <DiscoveryPanel liffId={liffId} sections="activity" variant="home" />
      </section>
    </AppShell>
  );
}
