import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import IssueBoard from "../../../../../modules/repository/issue-board";
import AppShell from "../../../../(mobile)/_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ login: string; repository: string }>;
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const [{ login, repository }, query] = await Promise.all([params, searchParams]);
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  const initialCreating = query.create === "1";

  return (
    <AppShell>
      <IssueBoard
        key={`${ownerLogin}/${repository}:${initialCreating ? "create" : "view"}`}
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
        initialCreating={initialCreating}
      />
    </AppShell>
  );
}
