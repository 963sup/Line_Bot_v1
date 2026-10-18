import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresWbsBaselineEvents } from "../src/composition/bootstrap/baseline-events.js";
import { createPostgresLegacyWbsEntryQuery } from "../src/composition/bootstrap/legacy-entry.js";
import { createPostgresWbsScopeBoundary } from "../src/composition/bootstrap/scope-boundary.js";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "../src/composition/bootstrap/store.js";
import { WbsError } from "../src/domain/document.js";

const retiredTables = [
  "repository_wbs_outbox",
  "repository_wbs_governance_commands",
  "repository_wbs_baselines",
  "repository_wbs_reviews",
  "repository_wbs_proposal_versions",
  "repository_wbs_proposals",
  "repository_wbs_governance",
  "repository_wbs_policies",
  "repository_wbs_commands",
  "repository_wbs_revisions",
  "repository_wbs",
] as const;

test("ACTIVE boundary returns retired semantics without touching removed Repository WBS tables", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT app_private.claim_account_login('owner','USER','owner',1)");
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('reader','active',1,1)",
    );
    await sql.query("SELECT app_private.claim_account_login('reader','USER','reader',1)");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Source','public')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo-b','owner','owner','USER','Unmigrated','private')",
  );
  await pg.query(
    "INSERT INTO app_private.projects(id,owner_account_id,owner_account_kind,creator,name,version,created_at,updated_at) VALUES('project','owner','USER','owner','Target',1,1,1)",
  );
  const sourceRevisionId = randomUUID();
  const projectRevisionId = randomUUID();
  const transferId = randomUUID();
  const transferRequestId = randomUUID();
  await pg.transaction(async (sql) => {
    await sql.query("SET CONSTRAINTS ALL DEFERRED");
    await sql.query(
      "INSERT INTO app_private.repository_wbs(repository_id,version,head_revision_id) VALUES('repo',1,$1)",
      [sourceRevisionId],
    );
    await sql.query(
      "INSERT INTO app_private.repository_wbs_revisions(id,repository_id,version,parent_revision_id,actor_user_id,action,document,at) VALUES($1,'repo',1,NULL,'owner','initialize',$2::jsonb,1)",
      [sourceRevisionId, JSON.stringify({ schemaVersion: 1, nodes: [] })],
    );
    await sql.query(
      "INSERT INTO app_private.project_wbs(project_id,version,head_revision_id) VALUES('project',1,$1)",
      [projectRevisionId],
    );
    await sql.query(
      "INSERT INTO app_private.project_wbs_revisions(id,project_id,version,parent_revision_id,actor_user_id,action,document,at) VALUES($1,'project',1,NULL,'owner','initialize',$2::jsonb,1)",
      [projectRevisionId, JSON.stringify({ schemaVersion: 1, nodes: [] })],
    );
    await sql.query(
      "INSERT INTO app_private.wbs_scope_transfers(id,repository_id,project_id,actor_user_id,request_id,state,source_version,source_head_revision_id,revision_count,command_count,source_hash,requested_at,activated_at,release_sha) VALUES($1,'repo','project','owner',$2,'ACTIVE',1,$3,1,1,$4,1,2,$5)",
      [transferId, transferRequestId, sourceRevisionId, "a".repeat(64), "b".repeat(40)],
    );
    await sql.query(
      "INSERT INTO app_private.legacy_wbs_command_evidence(actor_user_id,request_id,repository_id,fingerprint,revision_id,project_id,transfer_id) VALUES('owner',$1,'repo','receipt',$2,'project',$3)",
      [randomUUID(), projectRevisionId, transferId],
    );
  });
  const gone = (error: unknown) => error instanceof WbsError && error.status === 410;
  await db.transaction(async (sql) => {
    await assert.rejects(createPostgresWbsScopeBoundary(sql).repositoryAvailable("repo-b"), gone);
  });
  await pg.query(
    `DROP TABLE ${retiredTables.map((name) => `app_private.${name}`).join(",")} CASCADE`,
  );
  for (const table of retiredTables) {
    assert.equal(
      (
        await pg.query<{ relation: string | null }>("SELECT to_regclass($1) AS relation", [
          `app_private.${table}`,
        ])
      ).rows[0]?.relation,
      null,
    );
  }

  const content = createPostgresWbsStore(db);
  const governance = createPostgresWbsGovernanceStore(db);
  await assert.rejects(content.read("owner", { repositoryId: "repo" }), gone);
  await assert.rejects(content.read("owner", { repositoryId: "repo-b" }), gone);
  await assert.rejects(content.history("owner", { repositoryId: "repo" }), gone);
  await assert.rejects(
    content.transact(
      "owner",
      { action: "initialize", repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 },
      async () => {
        throw new Error("retired operation must not run");
      },
    ),
    gone,
  );
  await assert.rejects(governance.view("owner", { repositoryId: "repo" }, {}), gone);
  await assert.rejects(
    governance.transact(
      "owner",
      {
        action: "set-policy",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: 0,
        expectedPolicyVersion: 1,
        minimumApprovals: 1,
        allowSelfApproval: true,
      },
      async () => {
        throw new Error("retired operation must not run");
      },
    ),
    gone,
  );
  const legacyEntry = createPostgresLegacyWbsEntryQuery(db);
  assert.deepEqual(await legacyEntry.read("owner", { repositoryId: "repo" }), {
    entryRequired: true,
  });
  assert.deepEqual(await legacyEntry.read("reader", { repositoryId: "repo" }), {
    entryRequired: true,
  });
  assert.deepEqual(await legacyEntry.read("owner", { repositoryId: "repo-b" }), {
    entryRequired: false,
  });

  const events = createPostgresWbsBaselineEvents(db);
  await assert.rejects(events.cursor("repo"), gone);
  assert.equal(await events.claim(10), null);
  await assert.rejects(
    events.acknowledge(
      {
        id: randomUUID(),
        cursor: 1,
        repositoryId: "repo",
        baselineId: randomUUID(),
        revisionId: sourceRevisionId,
        at: 1,
        leaseToken: randomUUID(),
      },
      10,
    ),
    gone,
  );
  await db.transaction(async (sql) => {
    const boundary = createPostgresWbsScopeBoundary(sql);
    await assert.rejects(boundary.repositoryAvailable("repo"), gone);
    assert.equal(await boundary.legacyQueueAvailable(), false);
    await boundary.projectWritable("project");
  });
});
