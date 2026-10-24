import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresProjectWbsStore } from "../src/adapters/outbound/persistence/project-content.js";
import {
  createProjectWbs,
  executeProjectWbsCommand,
} from "../src/application/use-cases/project-content.js";
import { createProjectWbsGovernance } from "../src/application/use-cases/project-governance.js";
import { createPostgresProjectWbsStore } from "../src/composition/bootstrap/project-content.js";
import { createPostgresProjectWbsGovernanceStore } from "../src/composition/bootstrap/project-governance.js";
import { createPostgresProjectWbsMetrics } from "../src/composition/bootstrap/project-metrics.js";
import { WbsError } from "../src/domain/document.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [id],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$2,1)", [id, id]);
  });
}

test("Project WBS preserves role, replay, review, publication and scope isolation", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["owner", "writer", "reader"]) await activeUser(db, id);
  await pg.query(
    "INSERT INTO app_private.projects(id,owner_account_id,owner_account_kind,creator,name,is_public,version,created_at,updated_at) VALUES('project-a','owner','USER','owner','Alpha',true,1,1,1),('project-b','owner','USER','owner','Beta',false,1,1,1)",
  );
  await pg.query(
    "INSERT INTO app_private.project_user_access(project_id,user_id,role,version,created_at,updated_at) VALUES('project-a','writer','WRITE',1,1,1)",
  );

  const content = createProjectWbs({
    activeUser: async (subject) => ({ id: subject }),
    store: () => createPostgresProjectWbsStore(db),
    now: () => 10,
  });
  const governance = createProjectWbsGovernance({
    activeUser: async (subject) => ({ id: subject }),
    store: () => createPostgresProjectWbsGovernanceStore(db),
    now: () => 20,
  });
  const initialized = await content.execute("owner", {
    action: "initialize",
    projectId: "project-a",
    requestId: randomUUID(),
    expectedVersion: 0,
  });
  assert.equal(initialized.projectId, "project-a");
  assert.equal((await content.read("reader", { projectId: "project-a" })).canEdit, false);
  await assert.rejects(
    content.execute("reader", {
      action: "create-node",
      projectId: "project-a",
      requestId: randomUUID(),
      expectedVersion: 1,
      node: {
        id: "work",
        parentId: null,
        position: 0,
        kind: "WORK_PACKAGE",
        title: "Work",
        description: "",
        deliverable: "Result",
        acceptanceCriteria: "Verified",
      },
    }),
    (error) => error instanceof WbsError && error.status === 403,
  );

  const saved = await content.execute("writer", {
    action: "create-node",
    projectId: "project-a",
    requestId: randomUUID(),
    expectedVersion: 1,
    node: {
      id: "work",
      parentId: null,
      position: 0,
      kind: "WORK_PACKAGE",
      title: "Work",
      description: "",
      deliverable: "Result",
      acceptanceCriteria: "Verified",
    },
  });
  assert.equal((await content.read("owner", { projectId: "project-b" })).version, 0);
  await assert.rejects(
    content.read("owner", { projectId: "project-b" }, saved.revision.id),
    (error) => error instanceof WbsError && error.status === 404,
  );

  const proposal = await governance.execute("writer", {
    action: "create-proposal",
    projectId: "project-a",
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Scope",
    reason: "",
    candidateRevisionId: saved.revision.id,
    baseBaselineId: null,
  });
  await assert.rejects(
    governance.execute("owner", {
      action: "create-proposal",
      projectId: "project-b",
      requestId: randomUUID(),
      expectedVersion: 0,
      title: "Cross scope",
      reason: "",
      candidateRevisionId: saved.revision.id,
      baseBaselineId: null,
    }),
    (error) => error instanceof WbsError && error.status === 409,
  );
  const reviewCommand = {
    action: "review-proposal" as const,
    projectId: "project-a",
    requestId: randomUUID(),
    expectedVersion: proposal.version,
    proposalId: proposal.proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
    decision: "APPROVE" as const,
    note: "",
  };
  const review = await governance.execute("writer", reviewCommand);
  assert.deepEqual(await governance.execute("writer", reviewCommand), review);
  await assert.rejects(
    governance.execute("writer", {
      action: "publish-proposal",
      projectId: "project-a",
      requestId: randomUUID(),
      expectedVersion: review.version,
      proposalId: proposal.proposalId,
      expectedProposalVersion: 1,
      expectedPolicyVersion: 1,
    }),
    (error) => error instanceof WbsError && error.status === 403,
  );
  const published = await governance.execute("owner", {
    action: "publish-proposal",
    projectId: "project-a",
    requestId: randomUUID(),
    expectedVersion: review.version,
    proposalId: proposal.proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
  });
  assert.ok(published.baselineId);
  assert.equal(
    (await createPostgresProjectWbsMetrics(db).read("reader", "project-a")).baseline?.id,
    published.baselineId,
  );
});

test("Project WBS pins Contract source privately with native SQL transaction and receipt rollback", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "source-owner");
  await activeUser(db, "project-writer");
  await pg.query(
    "INSERT INTO app_private.projects(id,owner_account_id,owner_account_kind,creator,name,is_public,version,created_at,updated_at) VALUES('destination-project','source-owner','USER','source-owner','Destination',false,1,1,1)",
  );
  await pg.query(
    "INSERT INTO app_private.project_user_access(project_id,user_id,role,version,created_at,updated_at) VALUES('destination-project','project-writer','WRITE',1,1,1)",
  );
  const source = {
    repositoryId: "origin-repo",
    contractId: randomUUID(),
    contractRevisionId: randomUUID(),
    lineId: randomUUID(),
  };
  let sourceReadable = true;
  const verifies: boolean[] = [];
  const store = new PostgresProjectWbsStore(db, () => ({
    async verifyLine(actor, repositoryId, ref, policy) {
      verifies.push(policy.requireActive);
      if (actor !== "project-writer" || repositoryId !== source.repositoryId || !sourceReadable)
        throw new WbsError(403, "Contract evidence is no longer readable.");
      assert.equal(ref.contractId, source.contractId);
      assert.equal(ref.contractRevisionId, source.contractRevisionId);
      assert.equal(ref.lineId, source.lineId);
      return {
        contractId: source.contractId,
        contractRevisionId: source.contractRevisionId,
        lineId: source.lineId,
        agreedQuantity: "26",
        content: {
          repositoryId: source.repositoryId,
          planRevisionId: "44444444-4444-4444-8444-444444444444",
          planVersion: 1,
          node: {
            id: "task-1",
            kind: "TASK",
            title: "Contract frozen source",
            body: "",
            path: [],
            plannedQuantity: {
              value: "26",
              measure: { id: "measure", name: "Set", subject: "", unit: "SET" },
            },
          },
        },
      };
    },
  }));
  const initialize = await executeProjectWbsCommand(
    store,
    "project-writer",
    {
      action: "initialize",
      projectId: "destination-project",
      requestId: randomUUID(),
      expectedVersion: 0,
    },
    1,
  );
  const parent = await executeProjectWbsCommand(
    store,
    "project-writer",
    {
      action: "create-node",
      projectId: "destination-project",
      requestId: randomUUID(),
      expectedVersion: initialize.revision.version,
      node: {
        id: "deliverable",
        parentId: null,
        position: 0,
        kind: "DELIVERABLE",
        title: "Distribution system",
        description: "",
        deliverable: "",
        acceptanceCriteria: "",
      },
    },
    2,
  );
  const cmd = {
    action: "import-contract" as const,
    projectId: "destination-project",
    requestId: randomUUID(),
    expectedVersion: parent.revision.version,
    confirmedDisclosure: true as const,
    source,
    node: {
      id: "work-package-1",
      parentId: "deliverable",
      position: 0,
      kind: "WORK_PACKAGE" as const,
      title: "User reviewed scope",
      description: "Delivery plan, not agreement copy",
      deliverable: "",
      acceptanceCriteria: "",
    },
  };
  const received = await executeProjectWbsCommand(store, "project-writer", cmd, 3);
  assert.equal(received.revision.action, "import-contract");
  assert.equal(received.revision.document.nodes.at(-1)?.id, cmd.node.id);
  assert.equal(Object.hasOwn(received.revision, "contractImport"), false);
  assert.equal(
    Object.hasOwn(
      (await store.read("project-writer", { projectId: "destination-project" })).revision ?? {},
      "contractImport",
    ),
    false,
  );
  const evidence = (
    await db.transaction((sql) =>
      sql.query("SELECT contract_import FROM project_wbs_revisions WHERE project_id=$1 AND id=$2", [
        "destination-project",
        received.revision.id,
      ]),
    )
  ).rows[0]?.contract_import;
  assert.deepEqual(evidence, {
    ...source,
    planRevisionId: "44444444-4444-4444-8444-444444444444",
    planNodeId: "task-1",
    wbsNodeId: cmd.node.id,
  });
  assert.deepEqual(await executeProjectWbsCommand(store, "project-writer", cmd, 4), received);
  assert.deepEqual(verifies, [true, false]);
  await assert.rejects(
    executeProjectWbsCommand(
      store,
      "project-writer",
      { ...cmd, node: { ...cmd.node, title: "reused" } },
      5,
    ),
  );
  sourceReadable = false;
  await assert.rejects(executeProjectWbsCommand(store, "project-writer", cmd, 6));
  const before = (await store.read("project-writer", { projectId: "destination-project" })).version;
  await assert.rejects(
    executeProjectWbsCommand(
      store,
      "project-writer",
      {
        ...cmd,
        requestId: randomUUID(),
        expectedVersion: before,
        node: { ...cmd.node, id: "unreadable" },
      },
      7,
    ),
  );
  assert.equal(
    (await store.read("project-writer", { projectId: "destination-project" })).version,
    before,
  );
  await assert.rejects(
    executeProjectWbsCommand(
      store,
      "source-owner",
      {
        ...cmd,
        requestId: randomUUID(),
        expectedVersion: before,
        node: { ...cmd.node, id: "not-owner" },
      },
      8,
    ),
  );
});
