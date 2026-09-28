import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import WorkplacesPanel from "../../../../../../modules/attendance/workplaces-panel";
import { repositoryPath } from "../../../../../../modules/repository/resource-navigation";
import { lineMiniApp } from "../../../../../../shared/server/line-mini-app";
import AppShell from "../../../../../(mobile)/_shell/app-shell";

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
      <WorkplacesPanel
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        backHref={repositoryPath(ownerLogin, repository)}
      />
    </AppShell>
  );
}
