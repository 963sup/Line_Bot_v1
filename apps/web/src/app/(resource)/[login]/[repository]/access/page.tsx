import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import AppShell from "../../../../(mobile)/_shell/app-shell";
import RepositoryAccess from "../../../../../modules/repository/repository-access";
import {
  repositoryPath,
  repositorySettingsPath,
} from "../../../../../modules/repository/resource-navigation";
import { PageHeading, PrimaryLink } from "../../../../../shared/ui/page-layout";

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
        title="Repository Access"
        description="管理 Repository-owned Direct User 與 Organization Team access grants。"
        back={repositoryPath(ownerLogin, repository)}
        actions={
          <PrimaryLink href={repositorySettingsPath(ownerLogin, repository)} tone="secondary">
            Repository Settings
          </PrimaryLink>
        }
      />
      <RepositoryAccess
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
    </AppShell>
  );
}
