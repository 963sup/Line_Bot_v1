import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import FilesPage from "./files-page";

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
  return <FilesPage liffId={lineMiniApp().liffId} ownerLogin={owner} repositoryName={repository} />;
}
