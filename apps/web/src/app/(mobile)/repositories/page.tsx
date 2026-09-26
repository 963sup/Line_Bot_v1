import RepositoryList from "../../../modules/repository/repository-list";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, PrimaryLink } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[]; resource?: string | string[] }>;
}) {
  const { intent, resource } = await searchParams;
  const createIssue = intent === "create-issue";
  const browseResource = resource === "issues" || resource === "discussions" ? resource : undefined;
  const choosingRepository = createIssue || Boolean(browseResource);

  return (
    <AppShell>
      <PageHeading
        title={choosingRepository ? "Choose Repository" : "Repositories"}
        description={
          createIssue
            ? "選擇具 write 或 admin capability 的 Repository，再建立該 Repository 擁有的 Issue。"
            : browseResource === "issues"
              ? "選擇 Repository，再進入該 Repository 的 canonical Issues surface。"
              : browseResource === "discussions"
                ? "選擇 Repository，再進入該 Repository 的 canonical Discussions surface。"
                : "目前登入者可存取的工作容器；進入後再查看該 Repository 的 Issues、Discussions、Labels 與 Milestones。"
        }
        actions={
          choosingRepository ? undefined : (
            <div className="inline-actions">
              <PrimaryLink href="/repositories/new">New Repository</PrimaryLink>
              <PrimaryLink href="/explore" tone="secondary">
                Explore
              </PrimaryLink>
            </div>
          )
        }
        back={choosingRepository ? "/home" : undefined}
      />
      <RepositoryList
        liffId={lineMiniApp().liffId}
        intent={
          createIssue
            ? "create-issue"
            : browseResource === "issues"
              ? "browse-issues"
              : browseResource === "discussions"
                ? "browse-discussions"
                : undefined
        }
      />
    </AppShell>
  );
}
