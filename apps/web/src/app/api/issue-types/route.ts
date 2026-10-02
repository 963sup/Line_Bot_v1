import { IssueError } from "@line_bot_v1/issue/domain";
import { issueBody, issueFailure } from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { issueTypes } from "../_composition/issue-types.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const values = new URL(request.url).searchParams.getAll("organizationAccountId");
    if (values.length !== 1) throw new IssueError(400, "Organization 識別碼不正確。");
    return jsonResponse(await issueTypes.list(await requestLineIdentity(request), values[0]!));
  } catch (error) {
    return issueFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    return jsonResponse(
      await issueTypes.command(await requestLineIdentity(request), await issueBody(request)),
    );
  } catch (error) {
    return issueFailure(error);
  }
}
