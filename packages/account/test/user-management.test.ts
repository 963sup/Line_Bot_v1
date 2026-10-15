import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { changeUserStatus } from "../src/application/use-cases/change-user-status.js";
import type {
  UserManagementPersistence,
  UserManagementTransaction,
} from "../src/contracts/output/user-management-transactions.js";
import { decideUserStatusChange, type UserStatusCommand } from "../src/domain/user.js";

const command: UserStatusCommand = {
  action: "suspend",
  requestId: randomUUID(),
  target: "target",
  expectedVersion: 1,
  reason: "test",
};
test("User status decisions preserve active and paused restoration and reject stale or inapplicable commands", () => {
  for (const restoreStatus of ["active", "paused"] as const) {
    assert.deepEqual(
      decideUserStatusChange(
        { ...command, action: "unsuspend" },
        { status: "suspended", version: 1, restoreStatus },
      ),
      { status: restoreStatus, event: "suspension_lifted" },
    );
  }
  assert.throws(
    () =>
      decideUserStatusChange(command, { status: "suspended", version: 1, restoreStatus: "active" }),
    { status: 409 },
  );
  assert.throws(
    () =>
      decideUserStatusChange(command, { status: "active", version: 2, restoreStatus: "active" }),
    { status: 409, message: "使用者狀態已更新，請重新讀取後確認。" },
  );
});

function fixture(overrides: Partial<UserManagementTransaction> = {}) {
  const calls: string[] = [];
  const tx: UserManagementTransaction = {
    permissions: async () => {
      calls.push("authority");
      return { canRead: true, canSuspend: true };
    },
    replay: async () => {
      calls.push("replay");
      return null;
    },
    target: async () => {
      calls.push("target");
      return { status: "active", version: 1, restoreStatus: "active" };
    },
    protectAdministrator: async () => {
      calls.push("protect");
    },
    writeStatus: async (status) => {
      assert.equal(status, "suspended");
      calls.push("write");
      return 2;
    },
    record: async (receipt, previous, event) => {
      assert.equal(receipt.version, 2);
      assert.equal(previous, "active");
      assert.equal(event, "suspended");
      calls.push("record");
    },
    ...overrides,
  };
  const store: UserManagementPersistence = { transact: async (_actor, _command, work) => work(tx) };
  return { calls, store };
}
test("status changes coordinate authority, replay, decision, write, renewed authority and recording", async () => {
  const f = fixture();
  await changeUserStatus(f.store, "operator", command, 10);
  assert.deepEqual(f.calls, [
    "authority",
    "replay",
    "target",
    "protect",
    "write",
    "authority",
    "record",
  ]);
});
test("authority and self-target rejection precede replay; exact replay avoids target, version and writes", async () => {
  const denied = fixture({ permissions: async () => ({ canRead: true, canSuspend: false }) });
  await assert.rejects(changeUserStatus(denied.store, "operator", command, 10), { status: 403 });
  assert.deepEqual(denied.calls, []);
  const self = fixture();
  await assert.rejects(changeUserStatus(self.store, "target", command, 10), { status: 403 });
  assert.deepEqual(self.calls, ["authority"]);
  const receipt = {
    id: "target",
    requestId: command.requestId,
    status: "suspended" as const,
    version: 2,
    at: 10,
  };
  const replay = fixture({ replay: async () => ({ matches: true, result: receipt }) });
  assert.deepEqual(await changeUserStatus(replay.store, "operator", command, 20), receipt);
  assert.deepEqual(replay.calls, ["authority"]);
});
