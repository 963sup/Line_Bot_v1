import { createIssueTypes } from "@line_bot_v1/issue/application/issue-types";
import { IssueError } from "@line_bot_v1/issue/domain";
import { PostgresIssueTypeStore } from "@line_bot_v1/issue/postgres/issue-types";
import { issueBody, issueFailure } from "../../../modules/repository/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { activeLineUser } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

let store: PostgresIssueTypeStore | undefined;

const issueTypes = createIssueTypes({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueTypeStore()),
  now: () => Date.now(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const values = new URL(request.url).searchParams.getAll("organizationAccountId");
    if (values.length !== 1) throw new IssueError(400, "Organization 識別碼不正確。");
    const [organizationAccountId] = values;
    if (!organizationAccountId) throw new IssueError(400, "Organization 識別碼不正確。");
    return jsonResponse(
      await issueTypes.list(await requestLineIdentity(request), organizationAccountId),
    );
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
