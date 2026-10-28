import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import type { PublicRepository } from "@line_bot_v1/repository/contracts/output/public";
import { notFound } from "next/navigation";
import RepositoryOverviewPanel from "../../../../modules/repository/repository-overview-panel";
import { logServerError } from "../../../../shared/observability/runtime-error.server";
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
  let publicRepository: PublicRepository | null = null;
  let publicLookupUnavailable = false;
  try {
    publicRepository = await publicRepositories().byOwnerAndName(ownerLogin, repository);
  } catch (error) {
    publicLookupUnavailable = true;
    logServerError(error, {
      service: "repository-overview-page",
      operation: "public-lookup",
      status: 503,
    });
  }
  return (
    <RepositoryOverviewPanel
      key={`${ownerLogin}/${repository}`}
      liffId={lineMiniApp().liffId}
      ownerLogin={ownerLogin}
      repositoryName={repository}
      publicRepository={publicRepository}
      publicLookupUnavailable={publicLookupUnavailable}
    />
  );
}
