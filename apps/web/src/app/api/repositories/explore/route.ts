import { IssueError } from "@line-work/repository/domain";
import { issueBody, repositoryFailure } from "../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { repositoryStars } from "../../_composition/repository-stars.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({
      items: await repositoryStars.explore(await requestLineIdentity(request)),
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await issueBody(request);
    const keys = Object.keys(body);
    if (
      keys.some((key) => key !== "action" && key !== "repositoryId") ||
      typeof body.repositoryId !== "string"
    ) {
      throw new IssueError(400, "Repository 操作格式不正確。");
    }
    const subject = await requestLineIdentity(request);
    if (body.action === "star") {
      await repositoryStars.star(subject, body.repositoryId);
    } else if (body.action === "unstar") {
      await repositoryStars.unstar(subject, body.repositoryId);
    } else {
      throw new IssueError(400, "不支援的 Repository 操作。");
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return repositoryFailure(error);
  }
}
