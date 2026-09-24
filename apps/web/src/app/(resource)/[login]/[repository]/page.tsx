import { normalizeAccountLogin } from "@line-work/account/domain/login";
import Link from "next/link";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../modules/repository/issue-board";
import {
  repositoryDiscussionsPath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
} from "../../../../modules/repository/resource-navigation";
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
        <nav className="page-heading-actions" aria-label="Repository resources">
          <Link
            className="button-link button-link-primary"
            href={repositoryIssuesPath(publicRepository.ownerLogin, publicRepository.name)}
          >
            Issues
          </Link>
          <Link
            className="button-link button-link-secondary"
            href={repositoryDiscussionsPath(publicRepository.ownerLogin, publicRepository.name)}
          >
            Discussions
          </Link>
          <Link
            className="button-link button-link-secondary"
            href={repositoryLabelsPath(publicRepository.ownerLogin, publicRepository.name)}
          >
            Labels
          </Link>
          <Link
            className="button-link button-link-secondary"
            href={repositoryMilestonesPath(publicRepository.ownerLogin, publicRepository.name)}
          >
            Milestones
          </Link>
        </nav>
      </main>
    );
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
