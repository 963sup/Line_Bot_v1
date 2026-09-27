import type { createRepositoryCreation } from "@line-work/repository/application/creation";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure } from "./http.server";

type RepositoryCreation = ReturnType<typeof createRepositoryCreation>;
type Identity = (request: Request) => Promise<string>;

export async function repositoryOwnersRequest(
  request: Request,
  creation: Pick<RepositoryCreation, "owners">,
  identity: Identity,
) {
  try {
    return jsonResponse({ items: await creation.owners(await identity(request)) });
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositoryCreateRequest(
  request: Request,
  creation: Pick<RepositoryCreation, "create">,
  identity: Identity,
) {
  try {
    const subject = await identity(request);
    return jsonResponse(await creation.create(subject, await repositoryBody(request)), 201);
  } catch (error) {
    return repositoryFailure(error);
  }
}
