import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProjectWbsCommand } from "../src/application/commands/project-content.js";
import { reviseWbsContent } from "../src/domain/content.js";
import { executeProjectWbsCommand } from "../src/application/use-cases/project-content.js";
import { executeProjectWbsGovernanceCommand } from "../src/application/use-cases/project-governance.js";
import type { ProjectWbsReceipt } from "../src/contracts/dto/project-content.js";
import type { ProjectWbsGovernanceReceipt } from "../src/contracts/dto/project-governance.js";
import type {
  ProjectWbsContentTransaction,
  ProjectWbsStore,
} from "../src/contracts/repositories/project-content.js";
import type {
  ProjectWbsGovernanceStore,
  ProjectWbsGovernanceTransaction,
} from "../src/contracts/repositories/project-governance.js";
import type { WbsRevision } from "../src/domain/content.js";
import { WbsError } from "../src/domain/document.js";
import { defaultWbsPolicy } from "../src/domain/governance.js";
import type { ProjectWbsRole } from "../src/domain/policies/project-access.js";

const requestId = "00000000-0000-4000-8000-000000000001";

test("Project content uses projectId and reauthorizes the current role before exact replay", async () => {
  assert.equal(
    parseProjectWbsCommand({
      action: "initialize",
      projectId: "project-a",
      requestId,
      expectedVersion: 0,
    }).projectId,
    "project-a",
  );
  assert.throws(
    () =>
      parseProjectWbsCommand({
        action: "initialize",
        repositoryId: "repo",
        requestId,
        expectedVersion: 0,
      }),
    (error) => error instanceof WbsError && error.status === 400,
  );
  let role: ProjectWbsRole = "WRITE";
  let closed = false;
  let current: WbsRevision | null = null;
  let receipt: ProjectWbsReceipt | null = null;
  const calls: string[] = [];
  const transaction: ProjectWbsContentTransaction = {
    get scope() {
      return { projectId: "project-a", role, closed };
    },
    nextId: () => "revision",
    contracts: {
      verifyLine: async () => {
        throw new Error("No Contract source is needed for ordinary Project WBS writes.");
      },
    },
    replay: async () => {
      calls.push("replay");
      return receipt;
    },
    load: async () => {
      calls.push("load");
      return current;
    },
    save: async (next) => {
      calls.push("save");
      current = next;
      receipt = { requestId, projectId: "project-a", revision: next };
      return receipt;
    },
  };
  const store: ProjectWbsStore = {
    read: async () => {
      throw new Error("not a read test");
    },
    history: async () => ({ revisions: [], next: null }),
    transact: async (_user, _command, operation) => operation(transaction),
  };
  const command = {
    action: "initialize" as const,
    projectId: "project-a",
    requestId,
    expectedVersion: 0,
  };
  const saved = await executeProjectWbsCommand(store, "actor", command, 1);
  assert.deepEqual(calls, ["replay", "load", "save"]);
  closed = true;
  calls.length = 0;
  assert.deepEqual(await executeProjectWbsCommand(store, "actor", command, 2), saved);
  assert.deepEqual(calls, ["replay"]);
  role = "READ";
  calls.length = 0;
  await assert.rejects(
    executeProjectWbsCommand(store, "actor", command, 3),
    (error) => error instanceof WbsError && error.status === 403,
  );
  assert.deepEqual(calls, []);
});

test("Project governance allows WRITE review but reserves publication and policy for ADMIN", async () => {
  let role: ProjectWbsRole = "WRITE";
  let replay: ProjectWbsGovernanceReceipt | null = null;
  const calls: string[] = [];
  const transaction: ProjectWbsGovernanceTransaction = {
    get scope() {
      return { projectId: "project-a", role, closed: true };
    },
    nextId: () => "unused",
    replay: async () => {
      calls.push("replay");
      return replay;
    },
    hasContent: async () => {
      throw new Error("replay should return first");
    },
    loadState: async () => ({ version: 0, baselineId: null, policy: defaultWbsPolicy }),
    loadProposal: async () => null,
    loadRevision: async () => {
      throw new Error("unused");
    },
    loadBaseline: async () => {
      throw new Error("unused");
    },
    loadReviews: async () => [],
    save: async () => {
      throw new Error("unused");
    },
  };
  const store: ProjectWbsGovernanceStore = {
    view: async () => {
      throw new Error("not a view test");
    },
    transact: async (_user, _command, operation) => operation(transaction),
  };
  const review = {
    action: "review-proposal" as const,
    projectId: "project-a",
    requestId,
    expectedVersion: 2,
    proposalId: "proposal",
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
    decision: "APPROVE" as const,
    note: "",
  };
  replay = {
    requestId,
    projectId: "project-a",
    action: "review-proposal",
    version: 3,
    proposalId: "proposal",
    baselineId: null,
  };
  assert.deepEqual(await executeProjectWbsGovernanceCommand(store, "writer", review, 1), replay);
  const publish = { ...review, action: "publish-proposal" as const };
  await assert.rejects(
    executeProjectWbsGovernanceCommand(store, "writer", publish, 1),
    (error) => error instanceof WbsError && error.status === 403,
  );
  role = "ADMIN";
  replay = { ...replay, action: "publish-proposal", baselineId: "baseline" };
  assert.deepEqual(await executeProjectWbsGovernanceCommand(store, "admin", publish, 1), replay);
  assert.deepEqual(calls, ["replay", "replay"]);
});

test("Project import requires explicit disclosure and a WORK_PACKAGE beneath an existing deliverable", () => {
  const valid = {
    action: "import-contract" as const,
    projectId: "project-a",
    requestId,
    expectedVersion: 2,
    confirmedDisclosure: true,
    source: {
      repositoryId: "repo-a",
      contractId: "11111111-1111-4111-8111-111111111111",
      contractRevisionId: "22222222-2222-4222-8222-222222222222",
      lineId: "33333333-3333-4333-8333-333333333333",
    },
    node: {
      id: "package-a",
      parentId: "group",
      position: 0,
      kind: "WORK_PACKAGE" as const,
      title: "User-reviewed installation",
      description: "Planning only",
      deliverable: "",
      acceptanceCriteria: "",
    },
  };
  assert.deepEqual(parseProjectWbsCommand(valid), valid);
  for (const invalid of [
    { ...valid, confirmedDisclosure: false },
    { ...valid, node: { ...valid.node, kind: "DELIVERABLE" } },
    { ...valid, node: { ...valid.node, parentId: null } },
    { ...valid, source: { ...valid.source, repositoryId: "" } },
    { ...valid, source: { ...valid.source, contractId: "broken" } },
    { ...valid, source: { ...valid.source, anotherOwner: "spoof" } },
    { ...valid, anotherOwner: "spoof" },
  ])
    assert.throws(
      () => parseProjectWbsCommand(invalid),
      (error) => error instanceof WbsError && error.status === 400,
    );
});

test("Project import rechecks current Project/Contract access and stores only a private source identity pin", async () => {
  const source = {
    repositoryId: "repo",
    contractId: "11111111-1111-4111-8111-111111111111",
    contractRevisionId: "22222222-2222-4222-8222-222222222222",
    lineId: "33333333-3333-4333-8333-333333333333",
  };
  const node = {
    id: "user-mapped-package",
    parentId: "deliverable",
    kind: "WORK_PACKAGE" as const,
    position: 0,
    title: "User mapped work package",
    description: "Reviewed by editor",
    deliverable: "",
    acceptanceCriteria: "",
  };
  const command = {
    action: "import-contract" as const,
    projectId: "project-a",
    requestId,
    expectedVersion: 2,
    confirmedDisclosure: true as const,
    source,
    node,
  };
  let current = reviseWbsContent(
    reviseWbsContent(null, 0, { action: "initialize" }, "actor", "revision-a", 1),
    1,
    {
      action: "create-node",
      node: { ...node, id: "deliverable", parentId: null, kind: "DELIVERABLE" },
    },
    "actor",
    "revision-b",
    2,
  );
  let role: ProjectWbsRole = "WRITE";
  let readable = true;
  let replay: ProjectWbsReceipt | null = null;
  let captured: unknown;
  const checks: string[] = [];
  const transaction: ProjectWbsContentTransaction = {
    get scope() {
      return { projectId: "project-a", role, closed: false };
    },
    contracts: {
      async verifyLine(actor, repositoryId, reference, policy) {
        checks.push("contract:" + String(policy.requireActive));
        if (actor !== "actor" || repositoryId !== "repo" || !readable)
          throw new WbsError(403, "Current Contract read access is required.");
        assert.deepEqual(reference, source);
        return {
          ...source,
          content: {
            repositoryId: "repo",
            planRevisionId: "44444444-4444-4444-8444-444444444444",
            planVersion: 1,
            node: {
              id: "source-task",
              kind: "TASK",
              title: "Contract source",
              body: "",
              path: [],
              plannedQuantity: { value: "26", measure: { id: "measure", name: "Set", subject: "", unit: "SET" } },
            },
          },
          agreedQuantity: "26",
        };
      },
    },
    nextId: () => "revision-c",
    replay: async () => {
      checks.push("receipt");
      return replay;
    },
    load: async () => {
      checks.push("load");
      return current;
    },
    save: async (next, evidence) => {
      checks.push("save");
      captured = evidence;
      current = next;
      replay = { requestId, projectId: "project-a", revision: next };
      return replay;
    },
  };
  const store: ProjectWbsStore = {
    read: async () => { throw Error("unused"); },
    history: async () => ({ revisions: [], next: null }),
    transact: async (_actor, _command, action) => action(transaction),
  };
  const first = await executeProjectWbsCommand(store, "actor", command, 3);
  assert.equal(first.revision.action, "import-contract");
  assert.equal(first.revision.document.nodes.at(-1)?.kind, "WORK_PACKAGE");
  assert.deepEqual(captured, {
    ...source,
    planRevisionId: "44444444-4444-4444-8444-444444444444",
    planNodeId: "source-task",
    wbsNodeId: node.id,
  });
  assert.deepEqual(checks, ["receipt", "load", "contract:true", "save"]);
  checks.length = 0;
  assert.deepEqual(await executeProjectWbsCommand(store, "actor", command, 4), first);
  assert.deepEqual(checks, ["receipt", "contract:false"]);
  role = "READ";
  checks.length = 0;
  await assert.rejects(
    executeProjectWbsCommand(store, "actor", command, 5),
    (error) => error instanceof WbsError && error.status === 403,
  );
  assert.deepEqual(checks, []);
  role = "WRITE";
  readable = false;
  checks.length = 0;
  await assert.rejects(executeProjectWbsCommand(store, "actor", command, 6));
  assert.deepEqual(checks, ["receipt", "contract:false"]);
});
