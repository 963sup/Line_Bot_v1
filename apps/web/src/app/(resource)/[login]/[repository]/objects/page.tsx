import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import { repositoryObjectsPath } from "../../../../../modules/repository/resource-navigation";
import ObjectPage from "./object-page";

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
  const basePath = repositoryObjectsPath(owner, repository);
  return (
    <>
      <ObjectPage
        key={`${owner}/${repository}`}
        ownerLogin={owner}
        repositoryName={repository}
        basePath={basePath}
        liffId={lineMiniApp().liffId}
      />
    </>
  );
}
