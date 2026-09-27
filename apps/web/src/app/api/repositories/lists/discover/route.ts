import { repositoryFailure } from "../../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../../shared/server/http";
import { repositoryDiscovery } from "../../../_composition/repository-discovery.server";
import { requestLineIdentity } from "../../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({
      items: await repositoryDiscovery.publishedStarLists(await requestLineIdentity(request)),
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}
