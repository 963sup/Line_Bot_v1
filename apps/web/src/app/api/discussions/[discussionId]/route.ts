import { repositoryDiscussionRequest } from "../../../../modules/repository/resources-http.server";
import { repositoryResources } from "../../_composition/repository-resources.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ discussionId: string }> },
) {
  const { discussionId } = await context.params;
  return repositoryDiscussionRequest(
    request,
    discussionId,
    repositoryResources,
    requestLineIdentity,
  );
}
