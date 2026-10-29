import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPostgresNotificationRepository } from "@line_bot_v1/notifications/composition/bootstrap/postgres-notification-repository";
import { createPostgresProjectBaselineDeliveryStore } from "@line_bot_v1/notifications/composition/bootstrap/project-baseline-delivery";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createProjectWbs } from "@line_bot_v1/wbs/application/use-cases/project-content";
import { createProjectWbsGovernance } from "@line_bot_v1/wbs/application/use-cases/project-governance";
import { createPostgresProjectWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/project-baseline-events";
import { createPostgresProjectWbsStore } from "@line_bot_v1/wbs/composition/bootstrap/project-content";
import { createPostgresProjectWbsGovernanceStore } from "@line_bot_v1/wbs/composition/bootstrap/project-governance";
import { createProjectActions } from "../src/application/use-cases/project-automation.js";
import { createProjectActionsWorker } from "../src/application/use-cases/project-worker.js";
import { createPostgresProjectActionDependencies } from "../src/composition/bootstrap/project-automation.js";

test("Project action persistence dedupes commands, fences leases and revokes Inbox source access", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    for (const id of ["owner", "reader"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT claim_account_login($1,'USER',$1,1)", [id]);
    }
  });
  await pg.query(
    "INSERT INTO app_private.projects(id,owner_account_id,owner_account_kind,number,creator,name,is_public,version,created_at,updated_at) VALUES('project','owner','USER',NULL,'owner','Project',false,1,1,1)",
  );
  await pg.query(
    "INSERT INTO app_private.project_user_access(project_id,user_id,role,version,created_at,updated_at) VALUES('project','reader','READ',1,1,1)",
  );
  await pg.query(
    "INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES('line:primary',$1,'reader')",
    [`U${"1".repeat(32)}`],
  );

  const content = createProjectWbs({
    activeUser: async (subject) => ({ id: subject }),
    store: () =>
      createPostgresProjectWbsStore({
        db,
        contentReader: () => ({
          read: async () => {
            throw new Error("Unexpected Content import in Actions test.");
          },
        }),
      }),
    now: () => 10,
  });
  const initialized = await content.execute("owner", {
    action: "initialize",
    projectId: "project",
    requestId: randomUUID(),
    expectedVersion: 0,
  });
  const saved = await content.execute("owner", {
    action: "create-node",
    projectId: "project",
    requestId: randomUUID(),
    expectedVersion: initialized.revision.version,
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
  const governance = createProjectWbsGovernance({
    activeUser: async (subject) => ({ id: subject }),
    store: () => createPostgresProjectWbsGovernanceStore(db),
    now: () => 20,
  });

  let now = 100;
  const store = createPostgresProjectActionDependencies(db);
  const steps = {
    events: createPostgresProjectWbsBaselineEvents(db),
    notifications: {
      deliver: async () => ({
        inbox: "skipped" as const,
        notificationId: null,
        line: "unavailable" as const,
        nextAt: null,
      }),
      cancel: async () => {},
    },
    check: async () => ({ findings: [] }),
  };
  const actions = createProjectActions({ ...store, steps, now: () => now });
  const worker = createProjectActionsWorker({ ...store, steps, now: () => now });
  const definition = {
    action: "define",
    projectId: "project",
    id: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "notify-wbs-baseline",
    recipients: ["reader"],
    enabled: true,
  };
  const firstDefinition = await actions.execute("owner", definition);
  assert.deepEqual(await actions.execute("owner", definition), firstDefinition);
  assert.equal((await pg.query("SELECT * FROM app_private.project_action_rules")).rowCount, 1);
  assert.equal((await pg.query("SELECT * FROM app_private.project_action_commands")).rowCount, 1);

  const proposal = await governance.execute("owner", {
    action: "create-proposal",
    projectId: "project",
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "Scope",
    reason: "",
    candidateRevisionId: saved.revision.id,
    baseBaselineId: null,
  });
  const review = await governance.execute("owner", {
    action: "review-proposal",
    projectId: "project",
    requestId: randomUUID(),
    expectedVersion: proposal.version,
    proposalId: proposal.proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
    decision: "APPROVE",
    note: "",
  });
  const published = await governance.execute("owner", {
    action: "publish-proposal",
    projectId: "project",
    requestId: randomUUID(),
    expectedVersion: review.version,
    proposalId: proposal.proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
  });
  assert.ok(published.baselineId);
  assert.deepEqual(await worker.once(1), { events: 1, claimed: 0, finished: 0, stale: 0 });

  const firstLease = await store.queue.claim(now);
  assert.ok(firstLease);
  now += 90_001;
  const replacement = await store.queue.claim(now);
  assert.ok(replacement);
  assert.equal(replacement.run.id, firstLease.run.id);
  assert.equal(
    await store.queue.finish(firstLease, now, (run) => ({
      ...run,
      status: "succeeded",
      version: run.version + 1,
    })),
    false,
  );

  const delivery = createPostgresProjectBaselineDeliveryStore(db, "line:primary");
  const input = {
    key: "project-revoke",
    projectId: "project",
    baselineId: published.baselineId,
    revisionId: saved.revision.id,
    recipient: "reader",
  };
  await delivery.create(input, "payload", now);
  const inbox = createPostgresNotificationRepository(db);
  assert.equal((await inbox.read("reader", {})).items.length, 1);
  await pg.query(
    "DELETE FROM app_private.project_user_access WHERE project_id='project' AND user_id='reader'",
  );
  assert.equal((await inbox.read("reader", {})).items.length, 0);
  assert.equal(
    await inbox.markRead(
      "reader",
      (await delivery.claim(input.key, now)).result.notificationId ?? "",
      now,
    ),
    null,
  );
});
