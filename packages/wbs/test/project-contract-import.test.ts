import assert from "node:assert/strict";
import { test } from "node:test";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { parseProjectWbsCommand } from "../src/application/commands/project-content.js";
import { executeProjectWbsCommand } from "../src/application/use-cases/project-content.js";
import type { ProjectWbsReceipt } from "../src/contracts/dto/project-content.js";
import type { ProjectWbsContentTransaction, ProjectWbsStore } from "../src/contracts/repositories/project-content.js";
import { reviseWbsContent, type WbsContractImportPin, type WbsRevision } from "../src/domain/content.js";
import { WbsError } from "../src/domain/document.js";
import type { ProjectWbsRole } from "../src/domain/policies/project-access.js";

const id = {
  request: "11111111-1111-4111-8111-111111111111",
  contract: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
  line: "44444444-4444-4444-8444-444444444444",
  plan: "55555555-5555-4555-8555-555555555555",
};
const command = parseProjectWbsCommand({
  action: "import-contract",
  projectId: "project-a",
  requestId: id.request,
  expectedVersion: 1,
  acknowledged: true,
  source: {
    repositoryId: "repository-A",
    contractId: id.contract,
    contractRevisionId: id.revision,
    lineId: id.line,
  },
  node: {
    id: "work-package-1",
    kind: "WORK_PACKAGE",
    parentId: null,
    position: 0,
    title: "Reviewed installation scope",
    description: "User-selected scope",
    deliverable: "Verified assembly",
    acceptanceCriteria: "Written acceptance evidence",
  },
});

test("Project WBS Contract import command requires exact IDs and explicit acknowledgement", () => {
  assert.equal(command.action, "import-contract");
  assert.throws(() => parseProjectWbsCommand({ ...command, acknowledged: false }), WbsError);
  assert.throws(
    () => parseProjectWbsCommand({ ...command, node: { ...command.node, kind: "DELIVERABLE" } }),
    WbsError,
  );
  assert.throws(
    () => parseProjectWbsCommand({ ...command, source: { ...command.source, extra: "forged" } }),
    WbsError,
  );
  assert.throws(
    () =>
      parseProjectWbsCommand({
        ...command,
        source: { ...command.source, contractId: "not-a-uuid" },
      }),
    WbsError,
  );
});

test("Project WBS import verifies exact ACTIVE Contract inside its transaction and writes one private pin", async () => {
  let role: ProjectWbsRole = "WRITE";
  let closed = false;
  let readable = true;
  let active = true;
  let current: WbsRevision | null = reviseWbsContent(
    null,
    0,
    { action: "initialize" },
    "owner",
    "initial-revision",
    1,
  );
  let receipt: ProjectWbsReceipt | null = null;
  let evidence: WbsContractImportPin | undefined;
  const operations: string[] = [];
  const tx: ProjectWbsContentTransaction = {
    get scope() {
      return { projectId: "project-a", closed, role };
    },
    nextId: () => "next-revision",
    replay: async () => {
      operations.push("replay");
      return receipt;
    },
    load: async () => {
      operations.push("load");
      return current;
    },
    contractLines: {
      async verifyLine(actor, repositoryId, reference, policy) {
        operations.push(policy.requireActive ? "verify-active" : "verify-historical");
        assert.equal(actor, "owner");
        assert.equal(repositoryId, "repository-A");
        assert.deepEqual(reference, {
          contractId: id.contract,
          contractRevisionId: id.revision,
          lineId: id.line,
        });
        if (!readable) throw new ContractError(403, "revoked", "FORBIDDEN");
        if (policy.requireActive && !active)
          throw new ContractError(409, "closed", "SOURCE_INVALID");
        return {
          contractId: id.contract,
          contractRevisionId: id.revision,
          lineId: id.line,
          agreedQuantity: "26",
          content: {
            repositoryId: "repository-A",
            planRevisionId: id.plan,
            planVersion: 1,
            node: {
              id: "task-a",
              kind: "TASK",
              title: "Installed assemblies",
              body: "",
              path: [],
              plannedQuantity: {
                value: "26",
                measure: { id: "measure", name: "Assembly", subject: "Installed", unit: "SET" },
              },
            },
          },
        };
      },
    },
    save: async (next, pin) => {
      operations.push("save");
      current = next;
      evidence = pin;
      receipt = { requestId: id.request, projectId: "project-a", revision: next };
      return receipt;
    },
  };
  const store: ProjectWbsStore = {
    read: async () => {
      throw new Error("unexpected read");
    },
    history: async () => ({ revisions: [], next: null }),
    transact: async (_actor, _command, use) => use(tx),
  };
  const result = await executeProjectWbsCommand(store, "owner", command, 100);
  assert.equal(result.revision.action, "import-contract");
  assert.equal(result.revision.document.nodes[0]?.kind, "WORK_PACKAGE");
  assert.equal(result.revision.document.nodes[0]?.title, command.node.title);
  assert.deepEqual(evidence, {
    repositoryId: "repository-A",
    contractId: id.contract,
    contractRevisionId: id.revision,
    lineId: id.line,
    planRevisionId: id.plan,
    contentNodeId: "task-a",
    nodeId: command.node.id,
  });
  assert.deepEqual(operations, ["replay", "load", "verify-active", "save"]);

  closed = true;
  active = false;
  operations.length = 0;
  const replay = await executeProjectWbsCommand(store, "owner", command, 200);
  assert.deepEqual(replay, result);
  assert.deepEqual(operations, ["replay", "verify-historical"]);

  readable = false;
  operations.length = 0;
  await assert.rejects(
    executeProjectWbsCommand(store, "owner", command, 300),
    (error) => error instanceof WbsError && error.status === 404,
  );
  assert.deepEqual(operations, ["replay", "verify-historical"]);
  readable = true;
  role = "READ";
  operations.length = 0;
  await assert.rejects(
    executeProjectWbsCommand(store, "owner", command, 400),
    (error) => error instanceof WbsError && error.status === 403,
  );
  assert.deepEqual(operations, []);
});
