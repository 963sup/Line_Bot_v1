import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { repositoryDiscovery } from "../src/app/api/_composition/repository-discovery.server";
import { repositoryStarLists } from "../src/app/api/_composition/repository-star-lists.server";
import { GET as listGet, POST as listPost } from "../src/app/api/repositories/lists/[listId]/route";
import { GET as discoverGet } from "../src/app/api/repositories/lists/discover/route";
import { GET as listsGet, POST as listsPost } from "../src/app/api/repositories/lists/route";
import {
  clearPendingRepositoryStarListCommand,
  clearPendingRepositoryStarListCreate,
  readPendingRepositoryStarListCommand,
  readPendingRepositoryStarListCreate,
  writePendingRepositoryStarListCommand,
  writePendingRepositoryStarListCreate,
} from "../src/modules/repository/star-list-pending-storage";
import { lineMiniApp } from "../src/shared/server/line-mini-app";

test("Repository Star List HTTP uses verified LINE identity and owner use cases", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  const lineUser = `U${"6".repeat(32)}`;
  const list = {
    id: "list-a",
    ownerLogin: "alice",
    name: "Operations",
    description: "",
    visibility: "private" as const,
    version: 1,
    visibleRepositoryCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  const discover = mock.method(repositoryDiscovery, "publishedStarLists", async () => [
    {
      id: "list-a",
      ownerLogin: "alice",
      name: "Operations",
      description: "",
      visibleRepositoryCount: 1,
      updatedAt: 1,
      repositories: [{ id: "repository-a", ownerLogin: "acme", name: "Operations" }],
    },
  ]);
  const mine = mock.method(repositoryStarLists, "mine", async () => [list]);
  const create = mock.method(repositoryStarLists, "create", async () => ({
    id: "list-a",
    version: 1,
    visibility: "private" as const,
    deleted: false,
  }));
  const detail = mock.method(repositoryStarLists, "detail", async () => ({
    ...list,
    editable: true,
    repositories: [],
  }));
  const command = mock.method(repositoryStarLists, "command", async () => ({
    id: "list-a",
    version: 2,
    visibility: "public" as const,
    deleted: false,
  }));
  const fetch = mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?")) {
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    }
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: lineUser });
    throw new Error("Unexpected network request");
  });

  const request = (path: string, body?: unknown) =>
    new Request(`https://app.example${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "https://app.example",
        "Content-Type": "application/json",
        "x-line-token": "offline-list",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  try {
    assert.equal((await discoverGet(request("/api/repositories/lists/discover"))).status, 200);
    assert.equal((await listsGet(request("/api/repositories/lists"))).status, 200);
    assert.equal(
      (
        await listsPost(
          request("/api/repositories/lists", {
            requestId: "11111111-1111-4111-8111-111111111111",
            name: "Operations",
            description: "",
          }),
        )
      ).status,
      201,
    );
    const context = { params: Promise.resolve({ listId: "list-a" }) };
    assert.equal((await listGet(request("/api/repositories/lists/list-a"), context)).status, 200);
    assert.equal(
      (
        await listPost(
          request("/api/repositories/lists/list-a", {
            requestId: "22222222-2222-4222-8222-222222222222",
            action: "publish",
            expectedVersion: 1,
          }),
          context,
        )
      ).status,
      200,
    );
    assert.equal(discover.mock.callCount(), 1);
    assert.equal(mine.mock.callCount(), 1);
    assert.equal(create.mock.callCount(), 1);
    assert.equal(detail.mock.callCount(), 1);
    assert.equal(command.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
    discover.mock.restore();
    mine.mock.restore();
    create.mock.restore();
    detail.mock.restore();
    command.mock.restore();
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});

test("Repository Star List pending storage scopes retries and clears only acknowledged requests", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  } as Storage;

  const create = {
    requestId: "11111111-1111-4111-8111-111111111111",
    name: "Operations",
    description: "Curated",
  };
  const newerCreate = {
    ...create,
    requestId: "33333333-3333-4333-8333-333333333333",
  };
  writePendingRepositoryStarListCreate(storage, "subject-a", create);
  assert.deepEqual(readPendingRepositoryStarListCreate(storage, "subject-a"), create);
  assert.equal(readPendingRepositoryStarListCreate(storage, "subject-b"), null);

  writePendingRepositoryStarListCreate(storage, "subject-a", newerCreate);
  assert.equal(clearPendingRepositoryStarListCreate(storage, "subject-a", create.requestId), false);
  assert.deepEqual(readPendingRepositoryStarListCreate(storage, "subject-a"), newerCreate);
  assert.equal(
    clearPendingRepositoryStarListCreate(storage, "subject-a", newerCreate.requestId),
    true,
  );
  assert.equal(readPendingRepositoryStarListCreate(storage, "subject-a"), null);

  const command = {
    requestId: "22222222-2222-4222-8222-222222222222",
    action: "publish" as const,
    expectedVersion: 3,
  };
  writePendingRepositoryStarListCommand(storage, "subject-a", "list-a", command);
  assert.deepEqual(readPendingRepositoryStarListCommand(storage, "subject-a", "list-a"), command);
  assert.equal(readPendingRepositoryStarListCommand(storage, "subject-b", "list-a"), null);
  assert.equal(readPendingRepositoryStarListCommand(storage, "subject-a", "list-b"), null);
  assert.equal(
    clearPendingRepositoryStarListCommand(
      storage,
      "subject-a",
      "list-a",
      "44444444-4444-4444-8444-444444444444",
    ),
    false,
  );
  assert.deepEqual(
    readPendingRepositoryStarListCommand(storage, "subject-a", "list-a"),
    command,
  );
  assert.equal(
    clearPendingRepositoryStarListCommand(storage, "subject-a", "list-a", command.requestId),
    true,
  );
  assert.equal(readPendingRepositoryStarListCommand(storage, "subject-a", "list-a"), null);
});
