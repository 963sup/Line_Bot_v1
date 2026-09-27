import { repositoryCreateRequest } from "../../../modules/repository/creation-http.server";
import { repositoryFailure } from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { repositoryCollection } from "../_composition/repository-collection.server";
import { repositoryCreation } from "../_composition/repository-creation.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({
      items: await repositoryCollection.accessible(await requestLineIdentity(request)),
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function POST(request: Request) {
  return repositoryCreateRequest(request, repositoryCreation, requestLineIdentity);
}
