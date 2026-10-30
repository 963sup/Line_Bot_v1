import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createProjectWbs } from "../src/application/use-cases/project-content.js";
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

  const importCommand = {
    action: "import-content-document" as const,
    projectId: "project-a",
    requestId: randomUUID(),
    expectedVersion: 1,
    repositoryId: "repo",
    contentRevisionId: randomUUID(),
    confirmedDisclosure: true as const,
  };
  await assert.rejects(
    content.execute("owner", importCommand),
    (error) => error instanceof WbsError && error.status === 503,
  );
  const wiredContent = createProjectWbs({
    activeUser: async (subject) => ({ id: subject }),
    store: () =>
      createPostgresProjectWbsStore(db, () => ({
        read: async () => {
          throw new WbsError(404, "Source revision unavailable.");
        },
      })),
    now: () => 10,
  });
  await assert.rejects(
    wiredContent.execute("owner", { ...importCommand, requestId: randomUUID() }),
    (error) => error instanceof WbsError && error.status === 404,
  );
  assert.equal((await content.read("owner", { projectId: "project-a" })).version, 1);
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
