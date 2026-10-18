import assert from "node:assert/strict";
import { test } from "node:test";
import type { WbsScopeTransfer } from "@line_bot_v1/wbs/contracts/dto/transfer";
import type { WbsScopeTransferStore } from "@line_bot_v1/wbs/contracts/repositories/transfer";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import {
  wbsTransferCancel,
  wbsTransferRead,
  wbsTransferRequest,
} from "../src/modules/repository/wbs-transfer-http.server";

test("WBS transfer transport preserves exact retry and failure classes", async (t) => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  });
  let saved: WbsScopeTransfer | null = null;
  let denied = false;
  const seen: unknown[] = [];
  const source = (actorUserId: string) => ({
    repositoryId: "repository",
    ownerAccountId: actorUserId,
    ownerKind: "USER" as const,
    visibility: "public" as const,
    archived: false,
    permissions: ["admin"],
  });
  const store: WbsScopeTransferStore = {
    readCurrent: async (actorUserId) => ({
      transfer: saved?.state === "REQUESTED" || saved?.state === "ACTIVE" ? saved : null,
      source: source(actorUserId),
    }),
    request: async (actorUserId, command, requestedAt, operation) => {
      seen.push([actorUserId, command]);
      if (denied) throw new WbsError(403, "forbidden");
      return operation({
        replay: async () => saved,
        source: async () => source(actorUserId),
        project: async () => ({
          projectId: command.projectId,
          ownerAccountId: actorUserId,
          ownerKind: "USER",
          role: "ADMIN",
          public: false,
          hasCollaboratorGrants: false,
          closed: false,
        }),
        snapshot: async () => ({
          sourceVersion: command.sourceVersion,
          sourceHeadRevisionId: command.sourceHeadRevisionId,
          revisionCount: command.sourceVersion,
          commandCount: command.sourceVersion,
          sourceHash: "hash",
        }),
        dependents: async () => ({
          repositoryWbsRows: 1,
          sourceRepositoryWbsRows: 1,
          governanceRows: 0,
          outboxRows: 0,
          actionRows: 0,
          notificationRows: 0,
        }),
        destinationEmpty: async () => true,
        save: async (snapshot) => {
          saved = {
            id: command.transferId,
            repositoryId: command.repositoryId,
            projectId: command.projectId,
            actorUserId,
            requestId: command.requestId,
            state: "REQUESTED",
            ...snapshot,
            requestedAt,
            activatedAt: null,
            releaseSha: null,
            cancelledAt: null,
            cancelRequestId: null,
          };
          return saved;
        },
      });
    },
    execute: async () => {
      throw new Error("release execution is not an HTTP capability");
    },
    readActive: async () => null,
    cancel: async (actorUserId, command, cancelledAt, operation) =>
      operation({
        load: async () => {
          if (!saved) throw new WbsError(404, "missing");
          return saved;
        },
        source: async () => source(actorUserId),
        cancel: async (transfer) => {
          saved = {
            ...transfer,
            state: "CANCELLED",
            cancelledAt,
            cancelRequestId: command.requestId,
          };
          return saved;
        },
      }),
  };
  let storeResolutions = 0;
  const provideStore = () => {
    storeResolutions++;
    return store;
  };
  const command = {
    transferId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    repositoryId: "repository",
    projectId: "project",
    sourceVersion: 1,
    sourceHeadRevisionId: "33333333-3333-4333-8333-333333333333",
  };
  const post = (body: unknown, identity = async () => "subject") =>
    wbsTransferRequest(
      new Request("https://example.com/api/repository-wbs/transfer", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      provideStore,
      identity,
      async () => ({ id: "actor" }),
      () => 10,
    );

  const first = await post(command);
  const replay = await post(command);
  assert.equal(first.status, 200);
  assert.deepEqual(await replay.json(), await first.json());
  assert.equal(seen.length, 2);
  assert.equal((await post({ ...command, actorUserId: "spoof" })).status, 400);
  const resolutionsBeforeUnauthorizedPost = storeResolutions;
  assert.equal(
    (await post(command, async () => Promise.reject(new WbsError(401, "login")))).status,
    401,
  );
  assert.equal(storeResolutions, resolutionsBeforeUnauthorizedPost);
  denied = true;
  assert.equal((await post(command)).status, 403);
  denied = false;

  const get = (identity = async () => "subject") =>
    wbsTransferRead(
      new Request("https://example.com/api/repository-wbs/transfer?repositoryId=repository"),
      provideStore,
      identity,
      async () => ({ id: "actor" }),
    );
  assert.equal((await get()).status, 200);
  assert.equal((await (await get()).json()).id, command.transferId);
  assert.equal((await get(async () => Promise.reject(new WbsError(401, "login")))).status, 401);

  const locatorReads: unknown[] = [];
  const locatorGet = (query: string, identity = async () => "subject") =>
    wbsTransferRead(
      new Request(`https://example.com/api/repository-wbs/transfer?${query}`),
      provideStore,
      identity,
      async () => ({ id: "actor" }),
      async (actorUserId, selector) => {
        locatorReads.push([actorUserId, selector]);
        return "repository";
      },
    );
  assert.equal((await locatorGet("owner=Alice&name=Alpha")).status, 200);
  assert.deepEqual(locatorReads, [["actor", { ownerLogin: "alice", repositoryName: "Alpha" }]]);
  assert.equal(
    (
      await locatorGet("owner=alice&name=Alpha", async () => {
        throw new WbsError(401, "login");
      })
    ).status,
    401,
  );
  assert.equal(locatorReads.length, 1);
  for (const query of [
    "owner=alice",
    "owner=alice&name=Alpha&repositoryId=other",
    "owner=alice&owner=other&name=Alpha",
    "repositoryId=repository&repositoryId=other",
    "repositoryId=repository&actorUserId=spoof",
  ])
    assert.equal((await locatorGet(query)).status, 400);
  assert.equal(locatorReads.length, 1);

  const currentRead = store.readCurrent;
  store.readCurrent = async () => ({ transfer: saved, source: source("another-owner") });
  assert.equal((await locatorGet("owner=alice&name=Alpha")).status, 403);
  store.readCurrent = currentRead;
  const beforeMissingLocator = storeResolutions;
  const missingLocator = await wbsTransferRead(
    new Request("https://example.com/api/repository-wbs/transfer?owner=alice&name=Missing"),
    provideStore,
    async () => "subject",
    async () => ({ id: "actor" }),
    async () => {
      throw new WbsError(404, "missing");
    },
  );
  assert.equal(missingLocator.status, 404);
  assert.equal(storeResolutions, beforeMissingLocator);

  const cancelCommand = {
    transferId: command.transferId,
    repositoryId: command.repositoryId,
    requestId: "55555555-5555-4555-8555-555555555555",
  };
  const cancel = (body: unknown, identity = async () => "subject") =>
    wbsTransferCancel(
      new Request("https://example.com/api/repository-wbs/transfer/cancel", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      provideStore,
      identity,
      async () => ({ id: "actor" }),
      () => 20,
    );
  const cancelled = await cancel(cancelCommand);
  assert.equal(cancelled.status, 200);
  assert.deepEqual(await cancelled.json(), saved);
  assert.equal((await get()).status, 200);
  assert.equal(await (await get()).json(), null);
  assert.deepEqual(await (await cancel(cancelCommand)).json(), saved);
  assert.equal(
    (await cancel({ ...cancelCommand, requestId: "66666666-6666-4666-8666-666666666666" })).status,
    409,
  );
  assert.equal(
    (await cancel(cancelCommand, async () => Promise.reject(new WbsError(401, "login")))).status,
    401,
  );
});
