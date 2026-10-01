import type { createRepositorySubscription } from "@line_bot_v1/repository/application/subscription";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure, repositoryPathSelector } from "./http.server";

type RepositorySubscription = ReturnType<typeof createRepositorySubscription>;
type Identity = (request: Request) => Promise<string>;

function selector(request: Request) {
  const search = new URL(request.url).searchParams;
  const allowed = new Set(["owner", "name"]);
  if (
    [...search.keys()].some((key) => !allowed.has(key)) ||
    search.getAll("owner").length !== 1 ||
    search.getAll("name").length !== 1
  ) {
    throw new RepositoryError(400, "Repository subscription 查詢參數不正確。");
  }
  try {
    return repositoryPathSelector(search.get("owner") ?? "", search.get("name") ?? "");
  } catch {
    throw new RepositoryError(400, "Repository subscription 路徑不正確。");
  }
}

export async function repositorySubscriptionViewRequest(
  request: Request,
  subscription: Pick<RepositorySubscription, "view">,
  identity: Identity,
) {
  try {
    return jsonResponse(await subscription.view(await identity(request), selector(request)));
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositorySubscriptionCommandRequest(
  request: Request,
  subscription: Pick<RepositorySubscription, "execute">,
  identity: Identity,
) {
  try {
    return jsonResponse(
      await subscription.execute(await identity(request), await repositoryBody(request)),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
