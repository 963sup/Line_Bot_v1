import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import { repositoryObjectsPath } from "../../../../../../modules/repository/resource-navigation";
import ObjectPage from "../object-page";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string; objectId: string }>;
}) {
  const { login, repository, objectId } = await params;
  let owner: string;
  try {
    owner = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(objectId)) notFound();
  const id = objectId.toLowerCase();
  const basePath = repositoryObjectsPath(owner, repository);
  return (
    <>
      <ObjectPage
        key={`${owner}/${repository}/${id}`}
        ownerLogin={owner}
        repositoryName={repository}
        objectId={id}
        basePath={basePath}
        liffId={lineMiniApp().liffId}
      />
    </>
  );
}
