import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../modules/repository/issue-board";
import RepositoryResourceNavigation from "../../../../modules/repository/repository-resource-navigation";
import RepositorySubscriptionControl from "../../../../modules/repository/repository-subscription-control";
import AppShell from "../../../(mobile)/_shell/app-shell";
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
        <RepositoryResourceNavigation
          ownerLogin={publicRepository.ownerLogin}
          repositoryName={publicRepository.name}
          active="overview"
        />
        <RepositorySubscriptionControl
          liffId={lineMiniApp().liffId}
          ownerLogin={publicRepository.ownerLogin}
          repositoryName={publicRepository.name}
          explicitInteraction
        />
      </main>
    );
  }

  return (
    <AppShell>
      <RepositorySubscriptionControl
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
      <IssueBoard
        key={`${ownerLogin}/${repository}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        navigationActive="overview"
      />
    </AppShell>
  );
}
