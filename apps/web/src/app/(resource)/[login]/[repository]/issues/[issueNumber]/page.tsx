import { normalizeIssueNumber } from "@line_bot_v1/issue/domain";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../../../modules/repository/issue-board";
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
