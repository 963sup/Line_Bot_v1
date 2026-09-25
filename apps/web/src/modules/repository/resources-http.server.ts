import type { createRepositoryResources } from "@line-work/repository/application/resources";
import { IssueError, normalizeRepositoryMilestoneNumber } from "@line-work/repository/domain";
import { jsonResponse } from "../../shared/server/http";
import { repositoryFailure, repositoryPathSelector } from "./http.server";

type RepositoryResources = ReturnType<typeof createRepositoryResources>;
type RequestIdentity = (request: Request) => Promise<string>;

function single(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  if (values.length > 1) throw new IssueError(400, "Repository 查詢參數不正確。");
  return values[0];
}

function selector(params: URLSearchParams) {
  const owner = single(params, "owner");
  const name = single(params, "name");
  if (!owner || !name) throw new IssueError(400, "Repository 路徑不正確。");
  return repositoryPathSelector(owner, name);
}

function listCursor(params: URLSearchParams, name = "after") {
  return single(params, name);
}

export async function repositoryDiscussionsRequest(
  request: Request,
  resources: Pick<RepositoryResources, "discussions">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await resources.discussions(
        await requestIdentity(request),
        selector(params),
        listCursor(params),
      ),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function repositoryDiscussionRequest(
  request: Request,
  discussionId: string,
  resources: Pick<RepositoryResources, "discussion">,
  requestIdentity: RequestIdentity,
) {
  try {
    const params = new URL(request.url).searchParams;
    return jsonResponse(
      await resources.discussion(
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
    if (number === null) throw new IssueError(400, "Milestone number 不正確。");
    return jsonResponse(
      await resources.milestone(await requestIdentity(request), selector(params), number),
    );
  } catch (error) {
    return repositoryFailure(error);
  }
}
