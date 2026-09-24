import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearPendingIssueCommand,
  legacyPendingIssueCommandKey,
  restorePendingIssueCommand,
  savePendingIssueCommand,
} from "../src/modules/repository/issue-pending-storage";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#values.delete(key);
  }

  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

function pending(repositoryId: string, owner = "user-a", requestId = `request-${repositoryId}`) {
  return {
    owner,
    command: {
      requestId,
      repositoryId,
      issueId: `issue-${repositoryId}`,
      expectedVersion: 1,
      action: "accept",
      note: "",
    },
  } as const;
}

test("pending issue command restores only for the same verified user and repository", () => {
  const storage = new MemoryStorage();
  savePendingIssueCommand(storage, pending("repo-a"));

  assert.equal(restorePendingIssueCommand(storage, "user-a", "repo-b"), null);
  assert.equal(restorePendingIssueCommand(storage, "user-b", "repo-a"), null);
  assert.deepEqual(restorePendingIssueCommand(storage, "user-a", "repo-a"), pending("repo-a"));
});

test("pending issue command clears only a matching acknowledged request", () => {
  const storage = new MemoryStorage();
  const first = pending("repo-a", "user-a", "request-old");
  const next = pending("repo-a", "user-a", "request-new");
  savePendingIssueCommand(storage, first);
  savePendingIssueCommand(storage, next);

  assert.equal(clearPendingIssueCommand(storage, first), false);
  assert.deepEqual(restorePendingIssueCommand(storage, "user-a", "repo-a"), next);

  assert.equal(clearPendingIssueCommand(storage, next), true);
  assert.equal(restorePendingIssueCommand(storage, "user-a", "repo-a"), null);
});

test("pending issue command remains recoverable until an acknowledged request clears it", () => {
  const storage = new MemoryStorage();
  const unknownResult = pending("repo-a", "user-a", "request-unknown");
  savePendingIssueCommand(storage, unknownResult);

  assert.deepEqual(restorePendingIssueCommand(storage, "user-a", "repo-a"), unknownResult);
  assert.deepEqual(restorePendingIssueCommand(storage, "user-a", "repo-a"), unknownResult);
});

test("legacy global pending command migrates only on its matching repository", () => {
  const storage = new MemoryStorage();
  storage.setItem(legacyPendingIssueCommandKey, JSON.stringify(pending("repo-a")));

  assert.equal(restorePendingIssueCommand(storage, "user-a", "repo-b"), null);
  assert.deepEqual(
    JSON.parse(storage.getItem(legacyPendingIssueCommandKey) ?? "null"),
    pending("repo-a"),
  );

  assert.deepEqual(restorePendingIssueCommand(storage, "user-a", "repo-a"), pending("repo-a"));
  assert.equal(storage.getItem(legacyPendingIssueCommandKey), null);
  assert.deepEqual(restorePendingIssueCommand(storage, "user-a", "repo-a"), pending("repo-a"));
});

test("pending issue command ignores wrong user, wrong scope, and invalid data", () => {
  const storage = new MemoryStorage();

  storage.setItem(legacyPendingIssueCommandKey, "not json");
  assert.equal(restorePendingIssueCommand(storage, "user-a", "repo-a"), null);

  storage.setItem(
    legacyPendingIssueCommandKey,
    JSON.stringify({ owner: "user-a", command: { repositoryId: "" } }),
  );
  assert.equal(restorePendingIssueCommand(storage, "user-a", "repo-a"), null);

  storage.setItem(legacyPendingIssueCommandKey, JSON.stringify(pending("repo-a", "user-b")));
  assert.equal(restorePendingIssueCommand(storage, "user-a", "repo-a"), null);
});
