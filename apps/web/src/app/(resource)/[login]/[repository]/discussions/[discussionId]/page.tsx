import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { normalizeDiscussionId } from "@line-work/repository/domain";
import { notFound } from "next/navigation";
import RepositoryResourcesPanel from "../../../../../../modules/repository/resources-panel";
import { lineMiniApp } from "../../../../../../shared/server/line-mini-app";
import AppShell from "../../../../../(mobile)/_shell/app-shell";

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
  const canonicalDiscussionId = normalizeDiscussionId(discussionId);
  if (canonicalDiscussionId === null) notFound();
  return (
    <AppShell>
      <RepositoryResourcesPanel
        key={`${ownerLogin}/${repository}/discussion/${canonicalDiscussionId}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        kind="discussion"
        discussionId={canonicalDiscussionId}
      />
    </AppShell>
  );
}
