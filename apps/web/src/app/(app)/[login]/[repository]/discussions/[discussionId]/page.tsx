import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { notFound } from "next/navigation";
import RepositoryResourcesPanel from "../../../../../../modules/repository/resources-panel";
import { lineMiniApp } from "../../../../../../shared/server/line-mini-app";
import AppShell from "../../../../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string; discussionId: string }>;
}) {
  const { login, repository, discussionId } = await params;
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  if (!discussionId || discussionId.length > 120) notFound();
  return (
    <AppShell>
      <RepositoryResourcesPanel
        key={`${ownerLogin}/${repository}/discussion/${discussionId}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        kind="discussion"
        discussionId={discussionId}
      />
    </AppShell>
  );
}
