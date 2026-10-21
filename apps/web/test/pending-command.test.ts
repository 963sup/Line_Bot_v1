import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acquirePendingCommandLock,
  confirmsPendingReceipt,
  pendingCommandKey,
  persistPendingCommand,
  releasePendingCommandLock,
  removePendingCommand,
  restorePendingCommand,
  shouldRetainPendingCommand,
} from "../src/shared/browser/pending-command";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const command = {
  action: "replace",
  repositoryId: "repository-1",
  requestId: "request-1",
  expectedVersion: 4,
  document: { private: "command payload" },
};

test("pending command restores only after the same trusted actor and Repository qualify", () => {
  const storage = new MemoryStorage();
  const saved = persistPendingCommand(storage, "content", "actor-1", "repository-1", command);
  assert.deepEqual(restorePendingCommand(storage, "content", "actor-1", "repository-1"), saved);
  assert.equal(restorePendingCommand(storage, "content", "actor-2", "repository-1"), null);
  assert.equal(restorePendingCommand(storage, "content", "actor-1", "repository-2"), null);
  assert.equal(storage.length, 1);
});

test("pending command clears only after a matching receipt", () => {
  const storage = new MemoryStorage();
  const saved = persistPendingCommand(storage, "resources", "actor-1", "repository-1", command);
  assert.equal(
    confirmsPendingReceipt(
      {
        requestId: "request-1",
        revision: { repositoryId: "repository-1", version: 5 },
      },
      saved,
    ),
    true,
  );
  assert.equal(
    confirmsPendingReceipt(
      {
        requestId: "different-request",
        revision: { repositoryId: "repository-1", version: 5 },
      },
      saved,
    ),
    false,
  );
  assert.equal(removePendingCommand(storage, saved), true);
  assert.equal(storage.length, 0);
});

test("a stale completion cannot remove a newer pending command", () => {
  const storage = new MemoryStorage();
  const first = persistPendingCommand(storage, "content", "actor-1", "repository-1", command);
  const second = persistPendingCommand(storage, "content", "actor-1", "repository-1", {
    ...command,
    requestId: "request-2",
  });

  assert.equal(removePendingCommand(storage, first), false);
  assert.deepEqual(restorePendingCommand(storage, "content", "actor-1", "repository-1"), second);
  assert.equal(removePendingCommand(storage, second), true);
  assert.equal(storage.length, 0);
});

test("mutation lock is single-flight and stale release cannot unlock a newer operation", () => {
  const lock: { current: symbol | null } = { current: null };
  const first = acquirePendingCommandLock(lock);
  assert.ok(first);
  assert.equal(acquirePendingCommandLock(lock), null);

  lock.current = null;
  const second = acquirePendingCommandLock(lock);
  assert.ok(second);
  assert.equal(releasePendingCommandLock(lock, first), false);
  assert.equal(lock.current, second);
  assert.equal(releasePendingCommandLock(lock, second), true);
  assert.equal(lock.current, null);
});

test("storage failure is fail-closed before mutation dispatch", () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new Error("storage unavailable");
  };
  let dispatched = false;
  assert.throws(() => {
    persistPendingCommand(storage, "contracts", "actor-1", "repository-1", command);
    dispatched = true;
  }, /storage unavailable/);
  assert.equal(dispatched, false);
});

test("pending keys are separated by feature, actor, and Repository", () => {
  assert.match(pendingCommandKey("content", "actor-1", "repository-1"), /^line_bot_v1:pending:/);
  assert.notEqual(
    pendingCommandKey("content", "actor-1", "repository-1"),
    pendingCommandKey("executions", "actor-1", "repository-1"),
  );
  assert.notEqual(
    pendingCommandKey("content", "actor-1", "repository-1"),
    pendingCommandKey("content", "actor-2", "repository-1"),
  );
});

test("a retry authorization failure does not erase an earlier unknown outcome", () => {
  const failure = (status: number, code: string) =>
    Object.assign(new Error("safe"), { status, code });
  assert.equal(shouldRetainPendingCommand(new TypeError("network"), false), true);
  assert.equal(shouldRetainPendingCommand(failure(503, "UNAVAILABLE"), false), true);
  assert.equal(shouldRetainPendingCommand(failure(403, "FORBIDDEN"), true), true);
  assert.equal(shouldRetainPendingCommand(failure(404, "NOT_FOUND"), true), true);
  assert.equal(shouldRetainPendingCommand(failure(403, "FORBIDDEN"), false), false);
  assert.equal(shouldRetainPendingCommand(failure(409, "VERSION_CONFLICT"), true), false);
});
