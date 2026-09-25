import { normalizeAccountLogin } from "@line-work/account/domain/login";
import { normalizeIssueNumber } from "@line-work/repository/domain";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../../../modules/repository/issue-board";
import { lineMiniApp } from "../../../../../../shared/server/line-mini-app";
import AppShell from "../../../../../(mobile)/_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string; issueNumber: string }>;
}) {
  const { login, repository, issueNumber } = await params;
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  const number = normalizeIssueNumber(issueNumber);
  if (number === null) notFound();

  return (
    <AppShell>
      <IssueBoard
        key={`${ownerLogin}/${repository}/${number}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        issueNumber={number}
      />
    </AppShell>
  );
}
