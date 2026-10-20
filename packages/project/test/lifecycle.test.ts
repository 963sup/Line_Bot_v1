import assert from "node:assert/strict";
import { test } from "node:test";
import { executeProjectLifecycle } from "../src/application/use-cases/project-lifecycle.js";
import type { ProjectManagementReceipt } from "../src/contracts/management.js";
import type { ProjectLifecyclePersistence } from "../src/contracts/output/project-lifecycle.js";
import { changeProjectLifecycle } from "../src/domain/project-lifecycle.js";
import { ProjectError } from "../src/domain.js";

test("Project lifecycle decides legal transitions and preserves version, role and state error precedence", () => {
  for (const role of ["READ", "WRITE", "ADMIN"] as const) {
    for (const closed of [false, true]) {
      for (const action of ["close-project", "reopen-project"] as const) {
        for (const expectedVersion of [1, 2]) {
          const desired = action === "close-project";
          const error =
            expectedVersion !== 2
              ? [409, "Project 已更新，請重新讀取後再操作。"]
              : role !== "ADMIN"
                ? [403, "目前 Project access 不允許此操作。"]
                : closed === desired
                  ? [
                      409,
                      desired ? "Project 已關閉，目前 planning facts 為唯讀。" : "Project 已開啟。",
                    ]
                  : null;
          const decide = () =>
            changeProjectLifecycle({ version: 2, closed }, role, expectedVersion, action, 10);
          if (error) {
            assert.throws(
              decide,
              (cause: unknown) =>
                cause instanceof ProjectError &&
                cause.status === error[0] &&
                cause.message === error[1],
            );
          } else {
            assert.deepEqual(decide(), { closed: desired, closedAt: desired ? 10 : null });
          }
        }
      }
    }
  }
});

test("Project lifecycle coordinates replay, load and atomic save through its transaction port", async () => {
  const calls: string[] = [];
  const command = {
    action: "close-project",
    requestId: "request",
    projectId: "project",
    expectedVersion: 2,
  } as const;
  const receipt: ProjectManagementReceipt = {
    requestId: command.requestId,
    action: command.action,
    projectId: command.projectId,
    resourceId: null,
    version: 3,
    at: 10,
    data: { closed: true },
  };
  let replay: ProjectManagementReceipt | null = null;
  let role: "READ" | "ADMIN" = "ADMIN";
  const persistence: ProjectLifecyclePersistence = {
    async transact(identity, selected, operation) {
      assert.deepEqual(identity, { userId: "actor" });
      assert.equal(selected, command);
      calls.push("transaction");
      return operation({
        async replay() {
          calls.push("replay");
          return replay;
        },
        async load() {
          calls.push("load");
          return { state: { version: 2, closed: false }, role };
        },
        async save(change, now) {
          calls.push("save");
          assert.deepEqual(change, { closed: true, closedAt: 10 });
          assert.equal(now, 10);
          return receipt;
        },
      });
    },
  };
  assert.equal(
    await executeProjectLifecycle(persistence, { userId: "actor" }, command, 10),
    receipt,
  );
  assert.deepEqual(calls, ["transaction", "replay", "load", "save"]);
  calls.length = 0;
  role = "READ";
  await assert.rejects(
    executeProjectLifecycle(persistence, { userId: "actor" }, command, 10),
    (error: unknown) => error instanceof ProjectError && error.status === 403,
  );
  assert.deepEqual(calls, ["transaction", "replay", "load"]);
  calls.length = 0;
  replay = receipt;
  assert.equal(
    await executeProjectLifecycle(persistence, { userId: "actor" }, command, 20),
    receipt,
  );
  assert.deepEqual(calls, ["transaction", "replay"]);
});
