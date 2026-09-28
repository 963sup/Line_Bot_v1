import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import RepositoryAccess from "../../../../../modules/repository/repository-access";
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
        title="Repository Access"
        description="管理 Repository-owned Direct User 與 Organization Team access grants。"
        back={repositoryPath(ownerLogin, repository)}
      />
      <RepositoryAccess
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
    </AppShell>
  );
}
