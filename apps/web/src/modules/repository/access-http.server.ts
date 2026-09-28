import type { createRepositoryAccess } from "@line_bot_v1/repository/application/access";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure, repositoryPathSelector } from "./http.server";

type RepositoryAccess = ReturnType<typeof createRepositoryAccess>;
type Identity = (request: Request) => Promise<string>;

function selector(request: Request) {
  const search = new URL(request.url).searchParams;
  const allowed = new Set(["owner", "name"]);
  if (
    [...search.keys()].some((key) => !allowed.has(key)) ||
    search.getAll("owner").length !== 1 ||
    search.getAll("name").length !== 1
  ) {
    throw new RepositoryError(400, "Repository access 查詢參數不正確。");
  }
  return repositoryPathSelector(search.get("owner") ?? "", search.get("name") ?? "");
}

export async function repositoryAccessViewRequest(
  request: Request,
  access: Pick<RepositoryAccess, "view">,
  identity: Identity,
) {
  try {
    return jsonResponse(await access.view(await identity(request), selector(request)));
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositoryAccessCommandRequest(
  request: Request,
  access: Pick<RepositoryAccess, "execute">,
  identity: Identity,
) {
  try {
    return jsonResponse(
      await access.execute(await identity(request), await repositoryBody(request)),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
