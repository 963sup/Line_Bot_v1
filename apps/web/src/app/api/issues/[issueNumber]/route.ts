import { issueFailure, repositoryPathSelector } from "../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { issues } from "../../_composition/issues.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ issueNumber: string }> }) {
  try {
    const { issueNumber } = await context.params;
    const number = Number(issueNumber);
    const params = new URL(request.url).searchParams;
    const ownerLogin = params.get("owner");
    const repositoryName = params.get("name");
    if (!Number.isSafeInteger(number) || number < 1 || !ownerLogin || !repositoryName) {
      return jsonResponse({ error: "Issue number 或 Repository 路徑不正確。" }, 400);
    }
    return jsonResponse(
      await issues.detail(
        await requestLineIdentity(request),
        number,
        repositoryPathSelector(ownerLogin, repositoryName),
      ),
    );
  } catch (error) {
    return issueFailure(error);
  }
}
