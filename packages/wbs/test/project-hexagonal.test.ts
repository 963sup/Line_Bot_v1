import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProjectWbsCommand } from "../src/application/commands/project-content.js";
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
import { assertContentImportCoverage, importContentWbs } from "../src/domain/content.js";
import { parseWbsDocument, WbsError } from "../src/domain/document.js";
import { defaultWbsPolicy } from "../src/domain/governance.js";
import type { ProjectWbsRole } from "../src/domain/policies/project-access.js";

const requestId = "00000000-0000-4000-8000-000000000001";

test("Content whole-revision mapping preserves hierarchy and accounts for every source row", () => {
  const source = {
    repositoryId: "repo-a",
    revisionId: "00000000-0000-4000-8000-000000000010",
    version: 7,
    nodes: [
      {
        id: "s",
        parentId: null,
        position: 0,
        kind: "SUBJECT" as const,
        title: "Subject",
        body: "",
      },
      { id: "o", parentId: "s", position: 0, kind: "OBJECT" as const, title: "Object", body: "" },
      { id: "so", parentId: "o", position: 0, kind: "SUBOBJECT" as const, title: "Sub", body: "" },
      { id: "w", parentId: "so", position: 0, kind: "WORK" as const, title: "Work", body: "scope" },
      { id: "t", parentId: "w", position: 0, kind: "TASK" as const, title: "Task", body: "detail" },
    ],
    sourceRows: [
      {
        documentId: "doc",
        revisionId: "doc-rev",
        sourceRowId: "line-1",
        disposition: "CONTENT_WORK" as const,
        nodeIds: ["w", "t"],
      },
      {
        documentId: "doc",
        revisionId: "doc-rev",
        sourceRowId: "line-2",
        disposition: "COMMERCIAL_ONLY" as const,
        nodeIds: [],
      },
    ],
  };
  const stableId = (seed: string) => {
    const hex = Array.from({ length: 32 }, (_, index) =>
      (seed.charCodeAt(index % seed.length) % 16).toString(16),
    )
      .join("")
      .split("");
    hex[12] = "5";
    hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16);
    const value = hex.join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  };
  const revision = importContentWbs(null, 0, source, "project-a", "actor", requestId, 1, stableId);
  const mapped = new Map(
    revision.contentImport?.nodeCoverage.map((entry) => [entry.contentNodeId, entry.wbsNodeId]),
  );
  const nodes = parseWbsDocument(revision.document).nodes;
  assert.equal(nodes.length, source.nodes.length);
  assert.equal(nodes.find((node) => node.id === mapped.get("t"))?.parentId, mapped.get("w"));
  assert.equal(nodes.find((node) => node.id === mapped.get("t"))?.kind, "WORK_PACKAGE");
  assert.deepEqual(
    revision.contentImport?.sourceRows.map((row) => [row.sourceRowId, row.wbsNodeIds.length]),
    [
      ["line-1", 2],
      ["line-2", 0],
    ],
  );
  assert.equal(
    importContentWbs(null, 0, source, "project-a", "actor", requestId, 1, stableId).document
      .nodes[0]?.id,
    nodes[0]?.id,
  );
  assert.throws(
    () => importContentWbs(revision, 1, source, "project-a", "actor", requestId, 2, stableId),
    WbsError,
  );
  assert.throws(
    () =>
      importContentWbs(
        null,
        0,
        {
          ...source,
          sourceRows: [
            ...source.sourceRows,
            {
              documentId: "doc",
              revisionId: "doc-rev",
              sourceRowId: "line-3",
              disposition: "CONTENT_WORK" as const,
              nodeIds: ["w", "t"],
            },
          ],
        },
        "project-a",
        "actor",
        requestId,
        1,
        stableId,
      ),
    /share a WBS node mapping/i,
  );
});

test("Content-to-WBS import rejects work rows without a Task work package", () => {
  const source = {
    repositoryId: "repo-a",
    revisionId: "content-rev",
    version: 1,
    nodes: [
      {
        id: "subject",
        parentId: null,
        position: 0,
        kind: "SUBJECT" as const,
        title: "S",
        body: "",
      },
      {
        id: "object",
        parentId: "subject",
        position: 0,
        kind: "OBJECT" as const,
        title: "O",
        body: "",
      },
      {
        id: "subobject",
        parentId: "object",
        position: 0,
        kind: "SUBOBJECT" as const,
        title: "SO",
        body: "",
      },
      {
        id: "work",
        parentId: "subobject",
        position: 0,
        kind: "WORK" as const,
        title: "W",
        body: "",
      },
    ],
    sourceRows: [
      {
        documentId: "doc",
        revisionId: "doc-rev",
        sourceRowId: "row",
        disposition: "CONTENT_WORK" as const,
        nodeIds: ["work"],
      },
    ],
  };
  assert.throws(
    () => importContentWbs(null, 0, source, "project-a", "actor", requestId, 1, (seed) => seed),
    /work package/i,
  );
});

test("Published Content imports retain source coverage after edits", () => {
  const source = {
    repositoryId: "repo-a",
    revisionId: "content-rev",
    version: 1,
    nodes: [
      {
        id: "subject",
        parentId: null,
        position: 0,
        kind: "SUBJECT" as const,
        title: "S",
        body: "",
      },
      {
        id: "object",
        parentId: "subject",
        position: 0,
        kind: "OBJECT" as const,
        title: "O",
        body: "",
      },
      {
        id: "subobject",
        parentId: "object",
        position: 0,
        kind: "SUBOBJECT" as const,
        title: "SO",
        body: "",
      },
      {
        id: "work",
        parentId: "subobject",
        position: 0,
        kind: "WORK" as const,
        title: "W",
        body: "",
      },
      { id: "task", parentId: "work", position: 0, kind: "TASK" as const, title: "T", body: "" },
    ],
    sourceRows: [
      {
        documentId: "doc",
        revisionId: "doc-rev",
        sourceRowId: "row",
        disposition: "CONTENT_WORK" as const,
        nodeIds: ["work", "task"],
      },
    ],
  };
  let idSequence = 0;
  const stableId = (_seed: string) =>
    `00000000-0000-4000-8000-${String(++idSequence).padStart(12, "0")}`;
  const imported = importContentWbs(null, 0, source, "project-a", "actor", requestId, 1, stableId);
  const taskId = imported.contentImport?.sourceRows[0]?.wbsNodeIds[1];
  assert.ok(taskId);
  const { contentImport: _importEvidence, ...candidateBase } = imported;
  const candidate: WbsRevision = {
    ...candidateBase,
    id: "candidate",
    parentRevisionId: imported.id,
    version: 2,
    action: "update-node",
    document: {
      ...imported.document,
      nodes: imported.document.nodes.filter((node) => node.id !== taskId),
    },
  };
  assert.throws(
    () => assertContentImportCoverage([candidate, imported]),
    /outside the imported revision/i,
  );

  const evidence = imported.contentImport;
  assert.ok(evidence);
  const incompleteEvidence: WbsRevision = {
    ...imported,
    contentImport: {
      ...evidence,
      nodeCoverage: evidence.nodeCoverage.slice(1),
    },
  };
  assert.throws(
    () => assertContentImportCoverage([incompleteEvidence]),
    /node coverage is incomplete/i,
  );
});

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
    content: {
      read: async () => {
        throw new Error("not a Content import test");
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

test("retired Contract-line WBS writes are rejected", () => {
  assert.throws(
    () =>
      parseProjectWbsCommand({
        action: "import-contract",
        projectId: "project-a",
        requestId,
        expectedVersion: 1,
      }),
    (error) => error instanceof WbsError && error.status === 400,
  );
});
