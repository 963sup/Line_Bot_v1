import { repositoryResourceManagementRequest } from "../../../modules/repository/resource-management-http.server";
import { repositoryLabelsRequest } from "../../../modules/repository/resources-http.server";
import { repositoryResourceManagement } from "../_composition/repository-resource-management.server";
import { repositoryResources } from "../_composition/repository-resources.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return repositoryLabelsRequest(request, repositoryResources, requestLineIdentity);
}

export async function POST(request: Request) {
  return repositoryResourceManagementRequest(
    request,
    "label",
    repositoryResourceManagement,
    requestLineIdentity,
  );
}
