import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PermissionCommand } from "../src/application/commands/permission.js";
import { changePermission } from "../src/application/use-cases/change-permission.js";
import type {
  PermissionChangeTransaction,
  PermissionPersistence,
} from "../src/contracts/output/permission-transactions.js";

const command: PermissionCommand = {
  requestId: randomUUID(),
  target: "target",
  permission: "users.read",
  enabled: true,
  expectedVersion: 0,
  reason: "test",
};

function fixture(overrides: Partial<PermissionChangeTransaction> = {}, onBegin = () => {}) {
  const calls: string[] = [];
  const receipt = { requestId: command.requestId, version: 1 };
  const tx: PermissionChangeTransaction = {
    canManage: true,
    target: { active: true },
    replay: async () => {
      calls.push("replay");
      return null;
    },
    version: async () => {
      calls.push("version");
      return 0;
    },
    dependencies: async () => {
      calls.push("dependencies");
      return { canReadUsers: false, hasSuspendGrant: false };
    },
    save: async (permission, enabled, version, now) => {
      assert.equal(permission, command.permission);
      assert.equal(enabled, command.enabled);
      assert.equal(version, 0);
      assert.equal(now, 123);
      calls.push("save");
      return receipt;
    },
    ...overrides,
  };
  const store: PermissionPersistence = {
    read: async () => {
      throw new Error("unexpected read");
    },
    transact: async (actor, target, evidence, work) => {
      assert.equal(actor, "admin");
      assert.equal(target, command.target);
      assert.deepEqual(evidence, {
        requestId: command.requestId,
        payload: JSON.stringify(command),
      });
      calls.push("begin");
      onBegin();
      const result = await work(tx);
      calls.push("commit");
      return result;
    },
  };
  return { calls, receipt, store };
}

test("permission changes coordinate current authority, replay, state, dependencies and atomic save", async () => {
  const f = fixture();
  assert.deepEqual(await changePermission(f.store, "admin", command, 123), f.receipt);
  assert.deepEqual(f.calls, ["begin", "replay", "version", "dependencies", "save", "commit"]);
});

test("caller mutation cannot change the intent used to authorize a locked target", async () => {
  command.target = "admin";
  const f = fixture({}, () => {
    command.target = "target";
  });
  try {
    await assert.rejects(changePermission(f.store, "admin", command, 123), { status: 403 });
    assert.deepEqual(f.calls, ["begin"]);
  } finally {
    command.target = "target";
  }
});

test("current authority and self-target rejection precede any receipt lookup", async () => {
  const unauthorized = fixture({ canManage: false });
  await assert.rejects(changePermission(unauthorized.store, "admin", command, 123), {
    status: 403,
  });
  assert.deepEqual(unauthorized.calls, ["begin"]);
  const self = fixture();
  command.target = "admin";
  try {
    await assert.rejects(changePermission(self.store, "admin", command, 123), { status: 403 });
    assert.deepEqual(self.calls, ["begin"]);
  } finally {
    command.target = "target";
  }
});

test("exact replay precedes missing target and stale state; changed fingerprints conflict", async () => {
  const receipt = { requestId: command.requestId, version: 42 };
  const exact = fixture({ target: null, replay: async () => ({ matches: true, result: receipt }) });
  assert.deepEqual(await changePermission(exact.store, "admin", command, 123), receipt);
  assert.deepEqual(exact.calls, ["begin", "commit"]);
  const conflict = fixture({
    target: null,
    replay: async () => ({ matches: false, result: receipt }),
  });
  await assert.rejects(changePermission(conflict.store, "admin", command, 123), {
    status: 409,
    message: "操作編號已用於不同內容。",
  });
  assert.deepEqual(conflict.calls, ["begin"]);
});

test("missing, stale and inactive targets fail before dependencies or writes", async () => {
  const missing = fixture({ target: null });
  await assert.rejects(changePermission(missing.store, "admin", command, 123), { status: 404 });
  assert.deepEqual(missing.calls, ["begin", "replay"]);
  const stale = fixture({ target: { active: false }, version: async () => 1 });
  await assert.rejects(changePermission(stale.store, "admin", command, 123), {
    status: 409,
    message: "權限已更新，請重新讀取後確認。",
  });
  const inactive = fixture({ target: { active: false } });
  await assert.rejects(changePermission(inactive.store, "admin", command, 123), {
    status: 409,
    message: "只能授權有效使用者。",
  });
  assert.deepEqual(inactive.calls, ["begin", "replay", "version"]);
});
