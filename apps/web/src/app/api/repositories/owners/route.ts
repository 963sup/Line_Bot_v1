import { repositoryOwnersRequest } from "../../../../modules/repository/creation-http.server";
import { repositoryCreation } from "../../_composition/repository-creation.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return repositoryOwnersRequest(request, repositoryCreation, requestLineIdentity);
}
