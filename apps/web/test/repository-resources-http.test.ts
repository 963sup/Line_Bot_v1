import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositoryResources } from "@line-work/repository/application/resources";
import {
  repositoryDiscussionRequest,
  repositoryDiscussionsRequest,
  repositoryLabelsRequest,
  repositoryMilestoneRequest,
  repositoryMilestonesRequest,
} from "../src/modules/repository/resources-http.server";
import { loginReturnUrl } from "../src/shared/presentation/entry-route";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

type RepositoryResources = ReturnType<typeof createRepositoryResources>;

const repository = {
  id: "repo-1",
  ownerLogin: "octo",
  name: "hello-world",
  capability: "read" as const,
};

test("repository resources HTTP reads path selector and cursor from query", async () => {
  let received:
    | {
        subject: string;
        selector: { ownerLogin: string; repositoryName: string };
        after?: string;
      }
    | undefined;
  const resources: Pick<RepositoryResources, "discussions"> = {
    discussions: async (subject, selector, after) => {
      received = { subject, selector, after };
      return { repository, discussions: [], next: null };
    },
  };

  const response = await repositoryDiscussionsRequest(
    new Request("https://example.com/api/discussions?owner=Octo&name=Hello-World&after=abc"),
    resources,
    async () => "line-user",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(received, {
    subject: "line-user",
    selector: { ownerLogin: "octo", repositoryName: "Hello-World" },
    after: "abc",
  });
});

test("repository resources HTTP rejects duplicate query and ambiguous milestone numbers", async () => {
  const discussions = await repositoryDiscussionsRequest(
    new Request("https://example.com/api/discussions?owner=octo&owner=evil&name=repo"),
    {
      discussions: async () => {
        throw new Error("not reached");
      },
    },
    async () => "line-user",
  );
  assert.equal(discussions.status, 400);

  const milestone = await repositoryMilestoneRequest(
    new Request("https://example.com/api/repository-milestones/1e2?owner=octo&name=repo"),
    "1e2",
    {
      milestone: async () => {
        throw new Error("not reached");
      },
    },
    async () => "line-user",
  );
  assert.equal(milestone.status, 400);
});

test("repository resources HTTP maps missing identity and unavailable source", async () => {
  const noIdentity = await repositoryLabelsRequest(
    new Request("https://example.com/api/repository-labels?owner=octo&name=repo"),
    {
      labels: async () => {
        throw new Error("not reached");
      },
    },
    async () => {
      throw new RequestIdentityError(401, "請重新登入 LINE。");
    },
  );
  assert.equal(noIdentity.status, 401);
  assert.deepEqual(await noIdentity.json(), { error: "請重新登入 LINE。" });

  const unavailable = await repositoryMilestonesRequest(
    new Request("https://example.com/api/repository-milestones?owner=octo&name=repo"),
    {
      milestones: async () => {
        throw new Error("private database detail");
      },
    },
    async () => "line-user",
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: "Repository 服務暫時不可用，請稍後重試。",
  });
});

test("repository resources HTTP exposes detail resources through owner contract", async () => {
  const discussion = await repositoryDiscussionRequest(
    new Request("https://example.com/api/discussions/d1?owner=octo&name=repo&commentsAfter=c1"),
    "d1",
    {
      discussion: async (subject, selector, id, commentsAfter) => ({
        repository,
        discussion: {
          id,
          repositoryId: repository.id,
          author: subject,
          title: selector.repositoryName,
          body: "body",
          category: "general",
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        comments: [],
        next: commentsAfter ?? null,
      }),
    },
    async () => "line-user",
  );
  assert.equal(discussion.status, 200);
  assert.equal(((await discussion.json()) as { next: string }).next, "c1");

  const milestone = await repositoryMilestoneRequest(
    new Request("https://example.com/api/repository-milestones/2?owner=octo&name=repo"),
    "2",
    {
      milestone: async (_subject, _selector, number) => ({
        repository,
        milestone: {
          id: "m1",
          repositoryId: repository.id,
          number,
          title: "Release",
          description: "",
          status: "open",
          dueAt: null,
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    },
    async () => "line-user",
  );
  assert.equal(milestone.status, 200);
  assert.equal(((await milestone.json()) as { milestone: { number: number } }).milestone.number, 2);
});

test("repository resource login continuation keeps resource paths and drops unrelated state", () => {
  for (const path of [
    "/octo/hello-world/discussions",
    "/octo/hello-world/discussions/D_kwDOA1",
    "/octo/hello-world/labels",
    "/octo/hello-world/milestones",
    "/octo/hello-world/milestones/2",
  ]) {
    const value = new URL(
      loginReturnUrl(`https://example.com${path}?token=secret&liff.state=x&issueView=mine`),
    );
    assert.equal(value.pathname, path);
    assert.equal(value.searchParams.has("token"), false);
    assert.equal(value.searchParams.has("liff.state"), false);
    assert.equal(value.searchParams.has("issueView"), false);
  }
});
