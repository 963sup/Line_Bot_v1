import { IssueError } from "@line-work/repository/domain";
import { repositoryFailure } from "../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { publicRepositories } from "../../_composition/repository-public.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => key !== "owner" && key !== "limit")) {
      throw new IssueError(400, "Repository 公開列表條件不正確。");
    }
    if (query.getAll("owner").length !== 1 || query.getAll("limit").length > 1) {
      throw new IssueError(400, "Repository 公開列表條件不正確。");
    }
    const owner = query.get("owner");
    if (!owner) throw new IssueError(400, "Repository owner 不可用。");
    const rawLimit = query.get("limit");
    const limit = rawLimit === null ? 6 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 12) {
      throw new IssueError(400, "Repository 公開列表範圍不正確。");
    }

    return jsonResponse(await publicRepositories.popularByOwner(owner, limit));
  } catch (error) {
    return repositoryFailure(error);
  }
}
