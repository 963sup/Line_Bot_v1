import { discussionDetailRequest } from "../../../../modules/repository/resources-http.server";
import { discussions } from "../../_composition/discussions.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ discussionId: string }> },
) {
  const { discussionId } = await context.params;
  return discussionDetailRequest(request, discussionId, discussions, requestLineIdentity);
}
