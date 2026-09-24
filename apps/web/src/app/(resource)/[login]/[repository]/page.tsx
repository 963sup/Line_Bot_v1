import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../modules/repository/issue-board";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";
import AppShell from "../../../(app)/_shell/app-shell";
import { publicRepositories } from "../../_composition/repository.server";

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
  const publicRepository = await publicRepositories().byOwnerAndName(ownerLogin, repository);

  if (publicRepository) {
    return (
      <main className="app-content">
        <p className="eyebrow">儲存庫</p>
        <h1>{publicRepository.name}</h1>
        <p>@{publicRepository.ownerLogin}</p>
      </main>
    );
  }

  return (
    <AppShell active="repositories">
      <IssueBoard
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
    </AppShell>
  );
}
