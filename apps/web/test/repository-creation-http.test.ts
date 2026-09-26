import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositoryCreation } from "@line-work/repository/application/creation";
import {
  repositoryCreateRequest,
  repositoryOwnersRequest,
} from "../src/modules/repository/creation-http.server";
import {
  clearPendingRepositoryCreate,
  readPendingRepositoryCreate,
  writePendingRepositoryCreate,
} from "../src/modules/repository/repository-create-pending-storage";

type Creation = ReturnType<typeof createRepositoryCreation>;

test("Repository create HTTP exposes owner options and a 201 create result", async () => {
  const owners = await repositoryOwnersRequest(
    new Request("https://example.com/api/repositories/owners"),
    { owners: async (subject) => [{ id: subject, kind: "USER", login: "alice" }] },
    async () => "user-1",
  );
  assert.equal(owners.status, 200);
  assert.deepEqual(await owners.json(), {
    items: [{ id: "user-1", kind: "USER", login: "alice" }],
  });

  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    let received: unknown;
    const response = await repositoryCreateRequest(
      new Request("https://example.com/api/repositories", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "11111111-1111-4111-8111-111111111111",
          ownerAccountId: "user-1",
          ownerKind: "USER",
          name: "Repo",
        }),
      }),
      {
        create: async (_subject, body) => {
          received = body;
          return {
            id: "repo-1",
            ownerAccountId: "user-1",
            ownerKind: "USER",
            ownerLogin: "alice",
            name: "Repo",
            visibility: "private",
            version: 1,
          };
        },
      } as Pick<Creation, "create">,
      async () => "user-1",
    );
    assert.equal(response.status, 201);
    assert.deepEqual(received, {
      requestId: "11111111-1111-4111-8111-111111111111",
      ownerAccountId: "user-1",
      ownerKind: "USER",
      name: "Repo",
    });
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Repository create HTTP rejects cross-origin mutation before owner use case", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    let called = false;
    const response = await repositoryCreateRequest(
      new Request("https://example.com/api/repositories", {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: "{}",
      }),
      {
        create: async () => {
          called = true;
          throw new Error("not reached");
        },
      } as Pick<Creation, "create">,
      async () => "user-1",
    );
    assert.equal(response.status, 403);
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Repository create pending storage preserves exact retry identity", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  } as Storage;
  const command = {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "user-1",
    ownerKind: "USER" as const,
    name: "Repo",
  };
  writePendingRepositoryCreate(storage, command);
  assert.deepEqual(readPendingRepositoryCreate(storage), command);
  clearPendingRepositoryCreate(storage);
  assert.equal(readPendingRepositoryCreate(storage), null);
});
