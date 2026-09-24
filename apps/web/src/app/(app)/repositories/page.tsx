import IssueBoard from "../../../modules/repository/issue-board";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string | string[] }>;
}) {
  const { repository } = await searchParams;
  const repositoryId = typeof repository === "string" ? repository : undefined;
  return (
    <AppShell>
      <IssueBoard liffId={lineMiniApp().liffId} repositoryId={repositoryId} />
    </AppShell>
  );
}
