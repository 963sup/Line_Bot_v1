import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import RepositoryManagementSettings from "../../../../../modules/repository/repository-management-settings";
import RepositorySettings from "../../../../../modules/repository/repository-settings";
import { repositoryPath } from "../../../../../modules/repository/resource-navigation";
import { lineMiniApp } from "../../../../../shared/server/line-mini-app";
import { PageHeading } from "../../../../../shared/ui/page-layout";
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
      <PageHeading
        title="Repository Settings"
        description="管理 Repository lifecycle、visibility 與打卡點。"
        back={repositoryPath(ownerLogin, repository)}
      />
      <RepositoryManagementSettings
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
      <RepositorySettings
        liffId={lineMiniApp().liffId}
        mapsApiKey={process.env.GOOGLE_MAPS_API_KEY?.trim() ?? ""}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
    </AppShell>
  );
}
