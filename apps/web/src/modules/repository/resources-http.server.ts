import type { createDiscussions } from "@line_bot_v1/discussion/application/discussions";
import type { createRepositoryResources } from "@line_bot_v1/repository/application/resources";
import {
  normalizeRepositoryMilestoneNumber,
  RepositoryError,
} from "@line_bot_v1/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryFailure, repositoryPathSelector } from "./http.server";

type Discussions = ReturnType<typeof createDiscussions>;
type RepositoryResources = ReturnType<typeof createRepositoryResources>;
type RequestIdentity = (request: Request) => Promise<string>;

function single(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  if (values.length > 1) throw new RepositoryError(400, "Repository 查詢參數不正確。");
  return values[0];
}

function selector(params: URLSearchParams) {
  const owner = single(params, "owner");
  const name = single(params, "name");
  if (!owner || !name) throw new RepositoryError(400, "Repository 路徑不正確。");
  return repositoryPathSelector(owner, name);
}

function listCursor(params: URLSearchParams, name = "after") {
  return single(params, name);
}

export async function discussionListRequest(
  request: Request,
  discussions: Pick<Discussions, "list">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await discussions.list(await requestIdentity(request), selector(params), listCursor(params)),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function discussionDetailRequest(
  request: Request,
  discussionId: string,
  discussions: Pick<Discussions, "detail">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await discussions.detail(
        await requestIdentity(request),
        selector(params),
        discussionId,
        listCursor(params, "commentsAfter"),
      ),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositoryLabelsRequest(
  request: Request,
  resources: Pick<RepositoryResources, "labels">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await resources.labels(await requestIdentity(request), selector(params), listCursor(params)),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositoryMilestonesRequest(
  request: Request,
  resources: Pick<RepositoryResources, "milestones">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await resources.milestones(
        await requestIdentity(request),
        selector(params),
        single(params, "status"),
        listCursor(params),
      ),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositoryMilestoneRequest(
  request: Request,
  milestoneNumber: string,
  resources: Pick<RepositoryResources, "milestone">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    const number = normalizeRepositoryMilestoneNumber(milestoneNumber);
    if (number === null) throw new RepositoryError(400, "Milestone number 不正確。");
    return jsonResponse(
      await resources.milestone(await requestIdentity(request), selector(params), number),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
