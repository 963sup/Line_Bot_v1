import {
  repositoryBody,
  repositoryFailure,
} from "../../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../../shared/server/http";
import { requestLineIdentity } from "../../../_composition/request-identity.server";
import { repositoryStarLists } from "../../../_composition/repository-star-lists.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ listId: string }> },
) {
  try {
    const { listId } = await context.params;
    return jsonResponse({
      item: await repositoryStarLists.detail(await requestLineIdentity(request), listId),
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ listId: string }> },
) {
  try {
    const { listId } = await context.params;
    const subject = await requestLineIdentity(request);
    return jsonResponse(
      await repositoryStarLists.command(subject, listId, await repositoryBody(request)),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
