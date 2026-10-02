import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { createRepositoryResourceManagement } from "@line_bot_v1/repository/application/resource-management";
import { repositoryResourceManagementRequest } from "../src/modules/repository/resource-management-http.server";

type Management = ReturnType<typeof createRepositoryResourceManagement>;

beforeEach((context) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  context.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
});

test("Repository resource HTTP keeps Label and Milestone mutation families separate", async () => {
  const calls: unknown[][] = [];
  const management: Pick<Management, "execute"> = {
    execute: async (...args) => {
      calls.push(args);
      return {
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        action: "create-label",
        label: {
          id: "label",
          repositoryId: "repo",
          name: "bug",
          color: "ff0000",
          description: "",
          version: 1,
        },
        deleted: false,
        at: 10,
      };
    },
  };

  const body = {
    action: "create-label",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 0,
    name: "bug",
    color: "ff0000",
  };
  const response = await repositoryResourceManagementRequest(
    new Request("https://example.com/api/repository-labels", {
      method: "POST",
      headers: { origin: "https://example.com", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    "label",
    management,
    async () => "line-user",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [["line-user", body]]);

  calls.length = 0;
  const wrongFamily = await repositoryResourceManagementRequest(
    new Request("https://example.com/api/repository-labels", {
      method: "POST",
      headers: { origin: "https://example.com", "content-type": "application/json" },
      body: JSON.stringify({
        action: "create-milestone",
        requestId: "22222222-2222-4222-8222-222222222222",
        repositoryId: "repo",
        expectedVersion: 0,
        title: "Release",
      }),
    }),
    "label",
    management,
    async () => "line-user",
  );
  assert.equal(wrongFamily.status, 400);
  assert.equal(calls.length, 0);
});

test("Repository resource HTTP maps unavailable mutation failures without leaking internals", async () => {
  let invoked = false;
  const response = await repositoryResourceManagementRequest(
    new Request("https://example.com/api/repository-milestones", {
      method: "POST",
      headers: { origin: "https://example.com", "content-type": "application/json" },
      body: JSON.stringify({
        action: "close-milestone",
        requestId: "33333333-3333-4333-8333-333333333333",
        repositoryId: "repo",
        expectedVersion: 1,
        milestoneId: "milestone",
      }),
    }),
    "milestone",
    {
      execute: async () => {
        invoked = true;
        throw new Error("private database detail");
      },
    },
    async () => "line-user",
  );
  assert.equal(invoked, true);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Repository 服務暫時不可用，請稍後重試。",
  });
});

test("Repository resource HTTP rejects missing and foreign origins before identity or mutation", async () => {
  for (const origin of [null, "https://foreign.example.com"]) {
    const headers = new Headers({ "content-type": "application/json" });
    if (origin !== null) headers.set("origin", origin);
    let identityCalls = 0;
    let mutationCalls = 0;
    const response = await repositoryResourceManagementRequest(
      new Request("https://example.com/api/repository-labels", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "create-label" }),
      }),
      "label",
      {
        execute: async () => {
          mutationCalls += 1;
          throw new Error("mutation must not run");
        },
      },
      async () => {
        identityCalls += 1;
        return "line-user";
      },
    );
    assert.equal(response.status, 403);
    assert.equal(identityCalls, 0);
    assert.equal(mutationCalls, 0);
  }
});

test("Repository resource HTTP fails closed when the trusted origin is not configured", async () => {
  delete process.env.APP_ORIGIN;
  let mutationCalls = 0;
  const response = await repositoryResourceManagementRequest(
    new Request("https://example.com/api/repository-labels", {
      method: "POST",
      headers: { origin: "https://example.com", "content-type": "application/json" },
      body: JSON.stringify({ action: "create-label" }),
    }),
    "label",
    {
      execute: async () => {
        mutationCalls += 1;
        throw new Error("mutation must not run");
      },
    },
    async () => "line-user",
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "服務網址尚未設定。" });
  assert.equal(mutationCalls, 0);
});
