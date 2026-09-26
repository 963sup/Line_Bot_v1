import { repositoryFailure } from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { repositoryCollection } from "../_composition/repository-collection.server";
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
