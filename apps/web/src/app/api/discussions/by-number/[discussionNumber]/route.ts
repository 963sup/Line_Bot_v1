import { normalizeDiscussionNumber } from "@line_bot_v1/discussion/domain";
import {
  repositoryFailure,
  repositoryPathSelector,
} from "../../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../../shared/server/http";
import { discussions } from "../../../_composition/discussions.server";
import { requestLineIdentity } from "../../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ discussionNumber: string }> },
) {
  try {
    const { discussionNumber } = await context.params;
    const number = normalizeDiscussionNumber(discussionNumber);
    const params = new URL(request.url).searchParams;
    const ownerLogin = params.get("owner");
    const repositoryName = params.get("name");
    if (number === null || !ownerLogin || !repositoryName) {
      return jsonResponse({ error: "Discussion number 或 Repository 路徑不正確。" }, 400);
    }
    return jsonResponse(
      await discussions.detailByNumber(
        await requestLineIdentity(request),
        repositoryPathSelector(ownerLogin, repositoryName),
        number,
        params.get("commentsAfter") ?? undefined,
      ),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
