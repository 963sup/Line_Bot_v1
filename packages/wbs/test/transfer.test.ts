import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCancelWbsScopeTransferCommand,
  parseRequestWbsScopeTransferCommand,
} from "../src/application/commands/transfer.js";
import {
  cancelWbsScopeTransfer,
  executeWbsScopeTransfer,
  readWbsScopeTransfer,
  requestWbsScopeTransfer,
} from "../src/application/use-cases/transfer.js";
import type { WbsScopeTransfer } from "../src/contracts/dto/transfer.js";
import type {
  WbsScopeTransferStore,
  WbsTransferCancelTransaction,
  WbsTransferExecutionTransaction,
  WbsTransferRequestTransaction,
} from "../src/contracts/repositories/transfer.js";
import { WbsError } from "../src/domain/document.js";
import type {
  WbsTransferDependentCounts,
  WbsTransferProjectFacts,
  WbsTransferSnapshot,
  WbsTransferSourceFacts,
} from "../src/domain/transfer.js";

const actor = "owner";
const request = {
  transferId: "10000000-0000-4000-8000-000000000001",
  requestId: "20000000-0000-4000-8000-000000000002",
  repositoryId: "repo",
  projectId: "project",
  sourceVersion: 5,
  sourceHeadRevisionId: "ecce9336-06ad-4f6e-a821-988ce59732e4",
} as const;
const source: WbsTransferSourceFacts = {
  repositoryId: "repo",
  ownerAccountId: actor,
  ownerKind: "USER",
  visibility: "public",
  archived: false,
  permissions: ["admin"],
};
const project: WbsTransferProjectFacts = {
  projectId: "project",
  ownerAccountId: actor,
  ownerKind: "USER",
  role: "ADMIN",
  public: false,
  closed: false,
  hasCollaboratorGrants: false,
};
const snapshot: WbsTransferSnapshot = {
  sourceVersion: 5,
  sourceHeadRevisionId: request.sourceHeadRevisionId,
  revisionCount: 5,
  commandCount: 5,
  sourceHash: "source-hash",
};
const requested: WbsScopeTransfer = {
  id: request.transferId,
  repositoryId: request.repositoryId,
  projectId: request.projectId,
  actorUserId: actor,
  requestId: request.requestId,
  state: "REQUESTED",
  ...snapshot,
  requestedAt: 10,
  activatedAt: null,
  releaseSha: null,
  cancelledAt: null,
  cancelRequestId: null,
};

test("transfer parsers canonicalize UUIDs for durable replay", () => {
  const parsedRequest = parseRequestWbsScopeTransferCommand({
    ...request,
    transferId: request.transferId.toUpperCase(),
    requestId: request.requestId.toUpperCase(),
    sourceHeadRevisionId: request.sourceHeadRevisionId.toUpperCase(),
  });
  assert.equal(parsedRequest.transferId, request.transferId);
  assert.equal(parsedRequest.requestId, request.requestId);
  assert.equal(parsedRequest.sourceHeadRevisionId, request.sourceHeadRevisionId);
  assert.equal(
    parseCancelWbsScopeTransferCommand({
      transferId: request.transferId.toUpperCase(),
      repositoryId: request.repositoryId,
      requestId: request.requestId.toUpperCase(),
    }).requestId,
    request.requestId,
  );
});

class MemoryTransferStore implements WbsScopeTransferStore {
  saved: WbsScopeTransfer | null = null;
  activated = 0;
  source = source;
  project = project;
  snapshot = snapshot;
  dependents: WbsTransferDependentCounts = {
    repositoryWbsRows: 1,
    sourceRepositoryWbsRows: 1,
    governanceRows: 0,
    outboxRows: 0,
    actionRows: 0,
    notificationRows: 0,
  };
  empty = true;

  async readActive() {
    return this.saved?.state === "ACTIVE" ? this.saved : null;
  }

  async readCurrent(actorUserId: string, repositoryId: string) {
    const transfer =
      this.saved &&
      this.saved.state !== "CANCELLED" &&
      this.saved.actorUserId === actorUserId &&
      this.saved.repositoryId === repositoryId
        ? this.saved
        : null;
    return { transfer, source: this.source };
  }

  request<T>(
    _actorUserId: string,
    _command: typeof request,
    _requestedAt: number,
    operation: (transaction: WbsTransferRequestTransaction) => Promise<T>,
  ) {
    return operation({
      replay: async () => this.saved,
      source: async () => this.source,
      project: async () => this.project,
      snapshot: async () => this.snapshot,
      dependents: async () => this.dependents,
      destinationEmpty: async () => this.empty,
      save: async (current) => {
        this.saved = { ...requested, ...current };
        return this.saved;
      },
    });
  }

  cancel<T>(
    _actorUserId: string,
    command: { requestId: string },
    cancelledAt: number,
    operation: (transaction: WbsTransferCancelTransaction) => Promise<T>,
  ) {
    const current = this.saved ?? requested;
    return operation({
      load: async () => current,
      source: async () => this.source,
      cancel: async (value) => {
        this.saved = {
          ...value,
          state: "CANCELLED",
          cancelledAt,
          cancelRequestId: command.requestId,
        };
        return this.saved;
      },
    });
  }

  execute<T>(
    _transferId: string,
    operation: (transaction: WbsTransferExecutionTransaction) => Promise<T>,
  ) {
    const current = this.saved ?? requested;
    return operation({
      load: async () => current,
      source: async () => this.source,
      project: async () => this.project,
      snapshot: async () => this.snapshot,
      dependents: async () => this.dependents,
      destinationEmpty: async () => this.empty,
      activate: async (value, releaseSha, activatedAt) => {
        this.activated += 1;
        this.saved = { ...value, state: "ACTIVE", releaseSha, activatedAt };
        return this.saved;
      },
    });
  }
}

test("request persists the exact five-revision source snapshot", async () => {
  const store = new MemoryTransferStore();
  const result = await requestWbsScopeTransfer(store, actor, request, 10);
  assert.equal(result.state, "REQUESTED");
  assert.equal(result.revisionCount, 5);
  assert.equal(result.commandCount, 5);
  assert.equal(result.sourceHash, "source-hash");
});

test("request preflight rejects occupied destinations without reserving them", async () => {
  const store = new MemoryTransferStore();
  store.empty = false;
  await assert.rejects(
    () => requestWbsScopeTransfer(store, actor, request, 10),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
  assert.equal(store.saved, null);
});

test("current transfer query still qualifies the source owner when no live intent exists", async () => {
  const store = new MemoryTransferStore();
  store.source = { ...source, ownerAccountId: "different-owner" };
  await assert.rejects(
    () => readWbsScopeTransfer(store, actor, request.repositoryId),
    (error: unknown) => error instanceof WbsError && error.status === 403,
  );
});

test("owner can cancel and exactly replay a stranded request", async () => {
  const store = new MemoryTransferStore();
  store.saved = requested;
  store.source = { ...source, archived: true, visibility: "private" };
  const command = {
    transferId: request.transferId,
    repositoryId: request.repositoryId,
    requestId: "30000000-0000-4000-8000-000000000003",
  };
  const cancelled = await cancelWbsScopeTransfer(store, actor, command, 30);
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(cancelled.cancelRequestId, command.requestId);
  assert.deepEqual(await cancelWbsScopeTransfer(store, actor, command, 99), cancelled);
  store.source = { ...source, ownerAccountId: "former-owner" };
  await assert.rejects(
    () => cancelWbsScopeTransfer(store, actor, command, 100),
    (error: unknown) => error instanceof WbsError && error.status === 403,
  );
  store.source = source;
  assert.equal(await readWbsScopeTransfer(store, actor, request.repositoryId), null);
  await assert.rejects(
    () =>
      executeWbsScopeTransfer(
        store,
        {
          transferId: request.transferId,
          currentMainSha: "a".repeat(40),
          deployedSha: "a".repeat(40),
          providerRecoveryReady: true,
        },
        101,
      ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
  await assert.rejects(
    () =>
      cancelWbsScopeTransfer(
        store,
        actor,
        { ...command, requestId: "40000000-0000-4000-8000-000000000004" },
        40,
      ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
});

test("request requires the same USER owner with source and target admin", async () => {
  for (const mutate of [
    (store: MemoryTransferStore) => (store.source = { ...source, visibility: "private" }),
    (store: MemoryTransferStore) => (store.source = { ...source, permissions: ["write"] }),
    (store: MemoryTransferStore) => (store.source = { ...source, archived: true }),
    (store: MemoryTransferStore) => (store.project = { ...project, public: true }),
    (store: MemoryTransferStore) => (store.project = { ...project, closed: true }),
    (store: MemoryTransferStore) => (store.project = { ...project, hasCollaboratorGrants: true }),
    (store: MemoryTransferStore) =>
      (store.project = { ...project, ownerAccountId: "different-owner" }),
  ]) {
    const store = new MemoryTransferStore();
    mutate(store);
    await assert.rejects(
      () => requestWbsScopeTransfer(store, actor, request, 10),
      (error: unknown) => error instanceof WbsError && [403, 409].includes(error.status),
    );
  }
});

test("execute revalidates snapshot and zero dependent state before activation", async () => {
  const store = new MemoryTransferStore();
  store.saved = requested;
  const command = {
    transferId: request.transferId,
    currentMainSha: "a".repeat(40),
    deployedSha: "a".repeat(40),
    providerRecoveryReady: true,
  };
  const active = await executeWbsScopeTransfer(store, command, 20);
  assert.equal(active.state, "ACTIVE");
  assert.equal(active.releaseSha, "a".repeat(40));
  assert.equal(store.activated, 1);

  const blocked = new MemoryTransferStore();
  blocked.saved = requested;
  blocked.dependents = { ...blocked.dependents, notificationRows: 1 };
  await assert.rejects(
    () => executeWbsScopeTransfer(blocked, command, 20),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );

  const granted = new MemoryTransferStore();
  granted.saved = requested;
  granted.project = { ...project, hasCollaboratorGrants: true };
  await assert.rejects(
    () => executeWbsScopeTransfer(granted, command, 20),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
});

test("ACTIVE execution retry returns durable state before destination checks", async () => {
  const store = new MemoryTransferStore();
  store.saved = {
    ...requested,
    state: "ACTIVE",
    activatedAt: 20,
    releaseSha: "b".repeat(40),
  };
  store.empty = false;
  const result = await executeWbsScopeTransfer(
    store,
    {
      transferId: request.transferId,
      currentMainSha: "invalid-after-commit",
      deployedSha: "different-after-commit",
      providerRecoveryReady: false,
    },
    30,
  );
  assert.equal(result.state, "ACTIVE");
  assert.equal(store.activated, 0);
  await assert.rejects(
    () =>
      cancelWbsScopeTransfer(
        store,
        actor,
        {
          transferId: request.transferId,
          repositoryId: request.repositoryId,
          requestId: "50000000-0000-4000-8000-000000000005",
        },
        31,
      ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
});

test("execute rejects mismatched release readback and changed source hash", async () => {
  const store = new MemoryTransferStore();
  await assert.rejects(
    () =>
      executeWbsScopeTransfer(
        store,
        {
          transferId: request.transferId,
          currentMainSha: "a".repeat(40),
          deployedSha: "b".repeat(40),
          providerRecoveryReady: true,
        },
        20,
      ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
  store.saved = requested;
  store.snapshot = { ...snapshot, sourceHash: "changed" };
  await assert.rejects(
    () =>
      executeWbsScopeTransfer(
        store,
        {
          transferId: request.transferId,
          currentMainSha: "a".repeat(40),
          deployedSha: "a".repeat(40),
          providerRecoveryReady: true,
        },
        20,
      ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
});
