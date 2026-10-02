import { IssueError } from "@line_bot_v1/issue/domain";
import { issueBody, issueFailure } from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { issueCollaboration } from "../_composition/issue-collaboration.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const repositoryId = params.get("repositoryId");
    const issueId = params.get("issueId");
    if (!repositoryId || !issueId) {
      throw new IssueError(400, "Repository 或 Issue 識別碼不正確。");
    }
    return jsonResponse(
      await issueCollaboration.view(await requestLineIdentity(request), repositoryId, issueId),
    );
  } catch (error) {
    return issueFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    return jsonResponse(
      await issueCollaboration.command(
        await requestLineIdentity(request),
        await issueBody(request),
      ),
    );
  } catch (error) {
    return issueFailure(error);
  }
}
