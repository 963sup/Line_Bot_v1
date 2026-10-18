import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import Link from "next/link";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../modules/repository/issue-board";
import RepositoryPageHeader from "../../../../modules/repository/repository-page-header";
import RepositorySubscriptionControl from "../../../../modules/repository/repository-subscription-control";
import { PrimaryLink } from "../../../../shared/ui/page-layout";
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
      <>
        <RepositoryPageHeader
          ownerLogin={publicRepository.ownerLogin}
          repositoryName={publicRepository.name}
          active="overview"
          back={`/${encodeURIComponent(publicRepository.ownerLogin)}`}
        />
        <RepositorySubscriptionControl
          liffId={lineMiniApp().liffId}
          ownerLogin={publicRepository.ownerLogin}
          repositoryName={publicRepository.name}
          explicitInteraction
        />
        <PrimaryLink href="/projects">前往 Projects</PrimaryLink>
        <p>
          <Link
            href={`/${encodeURIComponent(publicRepository.ownerLogin)}/${encodeURIComponent(publicRepository.name)}/wbs`}
          >
            舊 WBS 與移轉
          </Link>
        </p>
      </>
    );
  }

  return (
    <IssueBoard
      key={`${ownerLogin}/${repository}`}
      liffId={lineMiniApp().liffId}
      ownerLogin={ownerLogin}
      repositoryName={repository}
      navigationActive="overview"
      overviewContent={
        <>
          <PrimaryLink href="/projects">前往 Projects</PrimaryLink>
          <p>
            <Link href={`/${encodeURIComponent(ownerLogin)}/${encodeURIComponent(repository)}/wbs`}>
              舊 WBS 與移轉
            </Link>
          </p>
          <RepositorySubscriptionControl
            liffId={lineMiniApp().liffId}
            ownerLogin={ownerLogin}
            repositoryName={repository}
          />
        </>
      }
    />
  );
}
