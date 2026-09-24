import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../../modules/repository/issue-board";
import { lineMiniApp } from "../../../../../shared/server/line-mini-app";
import AppShell from "../../../_shell/app-shell";

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
    <AppShell active="repositories">
      <IssueBoard
        key={`${ownerLogin}/${repository}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
    </AppShell>
  );
}
