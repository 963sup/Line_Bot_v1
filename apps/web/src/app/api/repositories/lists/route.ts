import { repositoryBody, repositoryFailure } from "../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { repositoryStarLists } from "../../_composition/repository-star-lists.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({
      items: await repositoryStarLists.mine(await requestLineIdentity(request)),
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const subject = await requestLineIdentity(request);
    return jsonResponse(
      await repositoryStarLists.create(subject, await repositoryBody(request)),
      201,
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
