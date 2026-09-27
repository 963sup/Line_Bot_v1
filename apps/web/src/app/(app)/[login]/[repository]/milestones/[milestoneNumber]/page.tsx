import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { notFound } from "next/navigation";
import RepositoryResourcesPanel from "../../../../../../modules/repository/resources-panel";
import { lineMiniApp } from "../../../../../../shared/server/line-mini-app";
import AppShell from "../../../../_shell/app-shell";

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
  if (!/^[1-9]\d*$/.test(milestoneNumber)) notFound();
  const number = Number(milestoneNumber);
  if (!Number.isSafeInteger(number)) notFound();
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
