import { repositoryOverviewRequest } from "../../../modules/repository/overview-http.server";
import { readRepositoryOverview } from "../_composition/repository-overview.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryOverviewRequest(request, readRepositoryOverview, requestLineIdentity);
}
