import RepositoryList from "../../../modules/repository/repository-list";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, PrimaryLink } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const { intent } = await searchParams;
  const createIssue = intent === "create-issue";

  return (
    <AppShell>
      <PageHeading
        title={createIssue ? "Choose Repository" : "Repositories"}
        description={
          createIssue
            ? "選擇具 write 或 admin capability 的 Repository，再建立該 Repository 擁有的 Issue。"
            : "目前登入者可存取的工作容器；進入後再查看該 Repository 的 Issues、Discussions、Labels 與 Milestones。"
        }
        actions={createIssue ? undefined : <PrimaryLink href="/explore">Explore</PrimaryLink>}
        back={createIssue ? "/home" : undefined}
      />
      <RepositoryList
        liffId={lineMiniApp().liffId}
        intent={createIssue ? "create-issue" : undefined}
      />
    </AppShell>
  );
}
