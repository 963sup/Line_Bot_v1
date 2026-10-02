import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import RepositoryResourcesPanel from "../../../../../modules/repository/resources-panel";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../../../../(mobile)/_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string }>;
}) {
  const { login, repository } = await params;
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  return (
    <AppShell>
      <RepositoryResourcesPanel
        key={`${ownerLogin}/${repository}/labels`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        kind="labels"
      />
    </AppShell>
  );
}
