import { RepositoryError } from "@line_bot_v1/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryFailure, repositoryPathSelector } from "./http.server";
import type { RepositoryOverview } from "./repository-overview";

type Identity = (request: Request) => Promise<string>;
type ReadRepositoryOverview = (
  subject: string,
  selector: { ownerLogin: string; repositoryName: string },
) => Promise<RepositoryOverview>;

function selector(request: Request) {
  const search = new URL(request.url).searchParams;
  const allowed = new Set(["owner", "name"]);
  if (
    [...search.keys()].some((key) => !allowed.has(key)) ||
    search.getAll("owner").length !== 1 ||
    search.getAll("name").length !== 1
  ) {
    throw new RepositoryError(400, "Repository Overview 查詢參數不正確。");
  }
  return repositoryPathSelector(search.get("owner") ?? "", search.get("name") ?? "");
}

export async function repositoryOverviewRequest(
  request: Request,
  read: ReadRepositoryOverview,
  identity: Identity,
) {
  try {
    return jsonResponse(await read(await identity(request), selector(request)));
  } catch (error) {
    return repositoryFailure(error);
  }
}
