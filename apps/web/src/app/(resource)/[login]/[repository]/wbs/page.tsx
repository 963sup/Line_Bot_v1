import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import WbsPanel from "../../../../../modules/repository/wbs-panel";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string }>;
}) {
  const { login, repository } = await params;
  let owner: string;
  try {
    owner = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  return (
    <WbsPanel
      key={`${owner}/${repository}`}
      ownerLogin={owner}
      repositoryName={repository}
      liffId={lineMiniApp().liffId}
    />
  );
}
