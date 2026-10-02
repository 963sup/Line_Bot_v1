import { normalizeDiscussionNumber } from "@line_bot_v1/discussion/domain";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import RepositoryResourcesPanel from "../../../../../../../modules/repository/resources-panel";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../../../../../(mobile)/_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{
    login: string;
    repository: string;
    discussionNumber: string;
  }>;
}) {
  const { login, repository, discussionNumber } = await params;
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  const number = normalizeDiscussionNumber(discussionNumber);
  if (number === null) notFound();
  return (
    <AppShell>
      <RepositoryResourcesPanel
        key={`${ownerLogin}/${repository}/discussion/${number}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        kind="discussion"
        discussionNumber={number}
      />
    </AppShell>
  );
}
