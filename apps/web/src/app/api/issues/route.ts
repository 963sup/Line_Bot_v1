import { IssueError } from "@line-work/repository/domain";
import {
  issueBody,
  issueFailure,
  repositoryPathSelector,
} from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { issues } from "../_composition/issues.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const view = params.get("issueView");
    if (view !== null && !["all", "mine", "created"].includes(view)) {
      throw new IssueError(400, "Issue 檢視不正確。");
    }
    const repositoryId = params.get("repository");
    const ownerLogin = params.get("owner");
    const repositoryName = params.get("name");
    if (
      (ownerLogin !== null || repositoryName !== null) &&
      (!ownerLogin || !repositoryName || repositoryId !== null)
    ) {
      throw new IssueError(400, "Repository 路徑不正確。");
    }
    const selector =
      ownerLogin && repositoryName
        ? repositoryPathSelector(ownerLogin, repositoryName)
        : repositoryId
          ? { repositoryId }
          : undefined;
    return jsonResponse(
      await issues.get(
        await requestLineIdentity(request),
        selector,
        true,
        view === "mine" || view === "created" ? view : undefined,
        params.get("after") ?? undefined,
        params.get("status") || undefined,
      ),
    );
  } catch (error) {
    return issueFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await issueBody(request);
    return jsonResponse({ issue: await issues.command(await requestLineIdentity(request), body) });
  } catch (error) {
    return issueFailure(error);
  }
}
