import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import WikiPanel from "../../../../../../modules/repository/wiki-panel";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string; pageId: string }>;
}) {
  const { login, repository, pageId } = await params;
  let owner: string;
  try {
    owner = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pageId)) notFound();
  const id = pageId.toLowerCase();
  return (
    <WikiPanel
      key={`${owner}/${repository}/${id}`}
      ownerLogin={owner}
      repositoryName={repository}
      pageId={id}
      liffId={lineMiniApp().liffId}
    />
  );
}
