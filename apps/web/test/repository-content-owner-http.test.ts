import assert from "node:assert/strict";
import { test } from "node:test";
import { ContentError } from "@line_bot_v1/content/domain/error";
import { type ContentWebRuntime, contentRequest } from "../src/modules/content/content-http.server";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

const scope = {
  actorUserId: "user-1",
  repository: { id: "repository-1", ownerLogin: "owner", name: "repo" },
  archived: false,
  canEdit: true,
  canManage: false,
};
const url = "https://app.example/api?owner=owner&name=repo";

function runtime(error?: ContentError): ContentWebRuntime {
  return {
    scope: async (_subject, selector) => {
      assert.deepEqual(selector, { ownerLogin: "owner", repositoryName: "repo" });
      return scope;
    },
    owner: () => ({
      read: async (actor, query) => {
        if (error) throw error;
        assert.equal(actor, "user-1");
        assert.deepEqual(query, { repositoryId: "repository-1" });
        return {
          revisionId: "revision-1",
          repositoryId: "repository-1",
          version: 1,
          parentRevisionId: null,
          actorUserId: "user-1",
          at: 1,
          action: "initialize",
          document: { schemaVersion: 1, measures: [], nodes: [], resourcePins: [] },
        };
      },
      history: async () => {
        if (error) throw error;
        return { revisions: [], next: null };
      },
      execute: async () => {
        if (error) throw error;
        throw new Error("must not execute");
      },
    }),
  };
}

test("owner HTTP requires identity and resolves current Repository scope", async () => {
  const denied = await contentRequest(new Request(url), runtime(), async () => {
    throw new RequestIdentityError(401, "sign in");
  });
  assert.equal(denied.status, 401);
  const read = await contentRequest(new Request(url), runtime(), async () => "subject");
  assert.equal(read.status, 200);
  assert.equal((await read.json()).revision.revisionId, "revision-1");
});

test("owner HTTP enforces origin and command Repository scope", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  try {
    let scopeCalls = 0;
    const forbiddenRuntime = runtime();
    forbiddenRuntime.scope = async () => {
      scopeCalls++;
      return scope;
    };
    const forbidden = await contentRequest(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ repositoryId: "repository-1" }),
      }),
      forbiddenRuntime,
      async () => "subject",
    );
    assert.equal(forbidden.status, 403);
    assert.equal(scopeCalls, 0);
    const mismatch = await contentRequest(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ repositoryId: "other" }),
      }),
      runtime(),
      async () => "subject",
    );
    assert.equal(mismatch.status, 400);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Content maps only an uninitialized current head to null", async () => {
  const missing = new ContentError(404, "missing", "NOT_FOUND");
  const current = await contentRequest(new Request(url), runtime(missing), async () => "subject");
  assert.equal(current.status, 200);
  assert.equal((await current.json()).revision, null);
  const historical = await contentRequest(
    new Request(`${url}&revisionId=00000000-0000-4000-8000-000000000001`),
    runtime(missing),
    async () => "subject",
  );
  assert.equal(historical.status, 404);
  const unavailable = await contentRequest(
    new Request(url),
    {
      ...runtime(),
      owner: () => ({
        ...runtime().owner(),
        read: async () => {
          throw new Error("provider detail");
        },
      }),
    },
    async () => "subject",
  );
  assert.equal(unavailable.status, 503);
  assert.notEqual((await unavailable.json()).revision, null);
});

test("owner HTTP preserves owner status and code", async () => {
  const response = await contentRequest(
    new Request(url),
    runtime(new ContentError(409, "conflict", "VERSION_CONFLICT")),
    async () => "subject",
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "conflict", code: "VERSION_CONFLICT" });
});

test("Content HTTP pins an explicitly requested plan revision instead of substituting current head", async () => {
  const pinnedId = "55555555-5555-4555-8555-555555555555";
  const fixture = runtime();
  const baseOwner = fixture.owner();
  const reference = await baseOwner.read("user-1", { repositoryId: "repository-1" });
  let checked = false;
  const target: ContentWebRuntime = {
    ...fixture,
    owner: () => ({
      ...baseOwner,
      read: async (actor, query) => {
        assert.equal(actor, "user-1");
        assert.deepEqual(query, { repositoryId: "repository-1", revisionId: pinnedId });
        checked = true;
        return reference;
      },
    }),
  };
  const response = await contentRequest(
    new Request(url + "&revisionId=" + pinnedId),
    target,
    async () => "subject",
  );
  assert.equal(response.status, 200);
  assert.equal(checked, true);
});
