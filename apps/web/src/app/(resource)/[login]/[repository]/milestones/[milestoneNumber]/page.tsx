import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { normalizeRepositoryMilestoneNumber } from "@line_bot_v1/repository/domain";
import { notFound } from "next/navigation";
import AppShell from "../../../../../(mobile)/_shell/app-shell";
import RepositoryResourcesPanel from "../../../../../../modules/repository/resources-panel";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string; milestoneNumber: string }>;
}) {
  const { login, repository, milestoneNumber } = await params;
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  const number = normalizeRepositoryMilestoneNumber(milestoneNumber);
  if (number === null) notFound();
  return (
    <AppShell>
      <RepositoryResourcesPanel
        key={`${ownerLogin}/${repository}/milestone/${number}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        kind="milestone"
        milestoneNumber={number}
      />
    </AppShell>
  );
}
