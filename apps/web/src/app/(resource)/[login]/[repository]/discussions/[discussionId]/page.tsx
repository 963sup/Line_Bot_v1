import { normalizeDiscussionId } from "@line_bot_v1/discussion/domain";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import RepositoryResourcesPanel from "../../../../../../modules/repository/resources-panel";
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
