import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntelligenceProcessing,
  type IntelligenceProcessor,
} from "../src/application/use-cases/processing.js";
import type { IntelligenceProcessingStore } from "../src/contracts/output/processing.js";
import type { ProcessingOutput, ProcessingRevision } from "../src/domain/processing.js";

const command = {
  repositoryId: "repository-1",
  requestId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  fileId: "33333333-3333-4333-8333-333333333333",
  fileRevisionId: "44444444-4444-4444-8444-444444444444",
  expectedVersion: 0,
};

const output: ProcessingOutput = {
  documentKind: "text",
  observations: [
    { id: "field-1", label: "Value", value: "test", uncertain: false },
  ],
};

function harness(run: IntelligenceProcessor["run"]) {
  let head: ProcessingRevision | null = null;
  let sequence = 0;
  const receipts = new Map<string, ProcessingRevision>();
  const store: IntelligenceProcessingStore = {
    nextId: () => String(++sequence),
    async read() {
      return head;
    },
    async list() {
      return { runs: [], next: null };
    },
    async transact(_actor, input, work) {
      const existing = receipts.get(input.requestId);
      // Persistence short-circuits an exact request before invoking the use case.
      if (existing) return existing;
      return work({
        repositoryId: input.repositoryId,
        permissions: ["write"],
        archived: false,
        nextId: () => String(++sequence),
        async replay() {
          return null;
        },
        async load() {
          return head;
        },
        async qualifySource() {},
        async save(revision, expectedVersion) {
          assert.equal(head?.version ?? 0, expectedVersion);
          head = revision;
        },
        async record(revision) {
          receipts.set(input.requestId, revision);
        },
      });
    },
  };
  const processor: IntelligenceProcessor = {
    id: "fixture",
    version: "v1",
    kind: "parser",
    supports: () => true,
    run,
  };
  const app = createIntelligenceProcessing({
    store,
    source: {
      async read(_actor, repositoryId) {
        assert.equal(repositoryId, command.repositoryId);
        return {
          revision: {
            id: command.fileRevisionId,
            fileId: command.fileId,
            repositoryId,
            version: 1,
            parentRevisionId: null,
            actorUserId: "actor",
            at: 1,
            name: "document.txt",
            mediaType: "text/plain",
            byteLength: 5,
            sha256: "a".repeat(64),
          },
          bytes: new TextEncoder().encode("hello"),
        };
      },
    },
    now: () => 1,
  });
  return { app, processor, current: () => head, receipts };
}

test("exact replay after completion returns the original receipt and does not run the processor", async () => {
  let calls = 0;
  const { app, processor, current } = harness(async () => {
    calls += 1;
    return output;
  });
  const first = await app.run("actor", command, processor);
  assert.equal(first.processing.state, "READY");
  assert.equal(calls, 1);
  const repeated = await app.run("actor", command, processor);
  assert.equal(repeated.processing.state, "RUNNING");
  assert.equal(repeated.processing.version, 1);
  assert.equal(current()?.state, "READY");
  assert.equal(calls, 1);
});

test("exact replay during an unfinished run never starts a concurrent processor", async () => {
  let release: ((value: ProcessingOutput) => void) | undefined;
  let entered: (() => void) | undefined;
  let calls = 0;
  const pending = new Promise<ProcessingOutput>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const { app, processor } = harness(async () => {
    calls += 1;
    entered?.();
    return pending;
  });
  const first = app.run("actor", command, processor);
  await started;
  const repeated = await app.run("actor", command, processor);
  assert.equal(repeated.processing.state, "RUNNING");
  assert.equal(calls, 1);
  release?.(output);
  assert.equal((await first).processing.state, "READY");
  assert.equal(calls, 1);
});
