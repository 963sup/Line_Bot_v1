import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createProjectWbs } from "@line_bot_v1/wbs/application/use-cases/project-content";
import { createPostgresProjectWbsStore } from "@line_bot_v1/wbs/composition/bootstrap/project-content";
import { createActions } from "../src/application/use-cases/automation.js";
import { createPostgresActionDependencies } from "../src/composition/bootstrap/automation.js";
import type { ActionLease } from "../src/contracts/output/worker.js";
import { seedCapability } from "./fixture.js";

test("ACTIVE transfer avoids every retired Actions table after those tables are dropped", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seedCapability(db, (query, values) => pg.query(query, values));
  await pg.query(
    "INSERT INTO app_private.projects(id,owner_account_id,owner_account_kind,number,creator,name,is_public,version,created_at,updated_at) VALUES('project','owner','USER',NULL,'owner','Project',false,1,1,1)",
  );
  const projectWbs = createProjectWbs({
    activeUser: async () => ({ id: "owner" }),
    store: () => createPostgresProjectWbsStore({
      db,
      contentReader: () => ({
        read: async () => {
          throw new Error("Unexpected Content import in Actions test.");
        },
      }),
    }),
    now: () => 10,
  });
  await projectWbs.execute("owner", {
    action: "initialize",
    projectId: "project",
    requestId: randomUUID(),
    expectedVersion: 0,
  });
  const source = (
    await pg.query<{ version: number; head_revision_id: string }>(
      "SELECT version,head_revision_id FROM app_private.repository_wbs WHERE repository_id='repo'",
    )
  ).rows[0];
  assert.ok(source);
  const revisionCount = (
    await pg.query<{ count: number | string }>(
      "SELECT count(*) AS count FROM app_private.repository_wbs_revisions WHERE repository_id='repo'",
    )
  ).rows[0]?.count;
  const commandCount = (
    await pg.query<{ count: number | string }>(
      "SELECT count(*) AS count FROM app_private.repository_wbs_commands WHERE repository_id='repo'",
    )
  ).rows[0]?.count;
  await pg.query(
    `INSERT INTO app_private.wbs_scope_transfers(id,repository_id,project_id,actor_user_id,request_id,state,source_version,source_head_revision_id,revision_count,command_count,source_hash,requested_at,activated_at,release_sha)
     VALUES($1,'repo','project','owner',$2,'ACTIVE',$3,$4,$5,$6,$7,20,21,$8)`,
    [
      randomUUID(),
      randomUUID(),
      source.version,
      source.head_revision_id,
      Number(revisionCount),
      Number(commandCount),
      "a".repeat(64),
      "b".repeat(40),
    ],
  );
  await pg.exec(
    "DROP TABLE app_private.action_commands,app_private.action_attempts,app_private.action_runs,app_private.action_events,app_private.action_rule_versions,app_private.action_rules CASCADE",
  );

  const store = createPostgresActionDependencies(db);
  assert.equal(await store.queue.claim(30), null);
  const rule = {
    id: randomUUID(),
    repositoryId: "other",
    version: 1,
    kind: "check-wbs-revision" as const,
    recipients: [],
    enabled: true,
    enabledAfter: 0,
    delegationId: randomUUID(),
    delegate: "owner",
    delegateVersion: 1,
  };
  const lease: ActionLease = {
    token: randomUUID(),
    until: 100,
    run: {
      id: randomUUID(),
      repositoryId: "other",
      rule,
      revisionId: source.head_revision_id,
      baselineId: null,
      status: "running",
      version: 1,
      step: 0,
      attempt: 1,
      due: 0,
      createdAt: 0,
      results: [],
    },
  };
  assert.equal(await store.queue.inspect(lease, 30), null);
  assert.equal(await store.queue.finish(lease, 30, (run) => run), false);
  await store.queue.accept(
    {
      id: randomUUID(),
      repositoryId: "other",
      revisionId: source.head_revision_id,
      baselineId: randomUUID(),
      cursor: 1,
      at: 30,
      leaseToken: randomUUID(),
    },
    async () => assert.fail("retired event must not fan out"),
  );

  const actions = createActions({
    ...store,
    steps: {
      events: {
        cursor: async () => 0,
        claim: async () => null,
        acknowledge: async () => false,
      },
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
    },
    now: () => 30,
  });
  const rejectsRetiredRepository = (operation: Promise<unknown>) =>
    assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof Error && "status" in error && Number(error.status) === 410,
    );
  await rejectsRetiredRepository(actions.rules("owner", "repo"));
  // `other` remains an accessible Repository, but global retirement must fence it before any
  // rule, command receipt, or run query can touch the now-removed legacy Actions tables.
  await rejectsRetiredRepository(actions.rules("owner", "other"));
  await rejectsRetiredRepository(actions.run("owner", "other", randomUUID()));
  await rejectsRetiredRepository(
    actions.execute("owner", {
      action: "define",
      repositoryId: "other",
      id: randomUUID(),
      requestId: randomUUID(),
      expectedVersion: 0,
      kind: "check-wbs-revision",
      recipients: [],
      enabled: true,
    }),
  );
});
