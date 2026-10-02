import { DiscussionError } from "@line_bot_v1/discussion/domain";
import { discussionBody, repositoryFailure } from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { discussionManagement } from "../_composition/discussion-management.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const repositoryId = params.get("repositoryId");
    const discussionId = params.get("discussionId") ?? undefined;
    if (!repositoryId) {
      throw new DiscussionError(400, "Repository 識別碼不正確。");
    }
    return jsonResponse(
      await discussionManagement.view(
        await requestLineIdentity(request),
        repositoryId,
        discussionId,
      ),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    return jsonResponse(
      await discussionManagement.command(
        await requestLineIdentity(request),
        await discussionBody(request),
      ),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
