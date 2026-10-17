import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { executeWbsCommand } from "../src/application/use-cases/content.js";
import { executeWbsGovernanceCommand } from "../src/application/use-cases/governance.js";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "../src/composition/bootstrap/store.js";
import { WbsError } from "../src/domain/document.js";

const databaseUrl = process.env.WBS_TEST_DATABASE_URL;
test("real PostgreSQL sessions serialize competing publication and exact retries", {
  skip: !databaseUrl && !process.env.CI,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const url = new URL(databaseUrl);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Concurrency tests only use a local disposable server",
  );
  const { pool, db, close } = await postgresSessions(databaseUrl);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
    await sql.query("SELECT app_private.claim_account_login('owner','USER','owner',1)");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','private')",
  );
  const content = createPostgresWbsStore(db),
    governance = createPostgresWbsGovernanceStore(db);
  await executeWbsCommand(
    content,
    "owner",
    { action: "initialize", repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 },
    1,
  );
  const draft = await executeWbsCommand(
    content,
    "owner",
    {
      action: "create-node",
      repositoryId: "repo",
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
        acceptanceCriteria: "Checked",
      },
    },
    2,
  );
  const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const view = await governance.view("owner", { repositoryId: "repo" }, {});
    const receipt = await executeWbsGovernanceCommand(
      governance,
      "owner",
      {
        action: "create-proposal",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: view.version,
        title: `Scope ${index}`,
        reason: "",
        candidateRevisionId: draft.revision.id,
        baseBaselineId: null,
      },
      3,
    );
    assert.ok(receipt.proposalId);
    ids.push(receipt.proposalId);
    await executeWbsGovernanceCommand(
      governance,
      "owner",
      {
        action: "review-proposal",
        repositoryId: "repo",
        requestId: randomUUID(),
        expectedVersion: receipt.version,
        proposalId: receipt.proposalId,
        expectedProposalVersion: 1,
        expectedPolicyVersion: 1,
        decision: "APPROVE",
        note: "",
      },
      4,
    );
  }
  const state = await governance.view("owner", { repositoryId: "repo" }, {});
  const commands = ids.map((proposalId) => ({
    action: "publish-proposal" as const,
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: state.version,
    proposalId,
    expectedProposalVersion: 1,
    expectedPolicyVersion: 1,
  }));
  // Hold the real row lock until both independent pool sessions are waiting on it.
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  const blockerPid = Number((await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
  assert.ok(Number.isSafeInteger(blockerPid));
  await blocker.query("SELECT 1 FROM app_private.repositories WHERE id='repo' FOR UPDATE");
  const competing = commands.map((command) =>
    executeWbsGovernanceCommand(governance, "owner", command, 5),
  );
  try {
    let waiting = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      waiting = Number(
        (
          await pool.query(
            `SELECT count(*) FROM pg_stat_activity activity
             WHERE activity.datname=current_database()
               AND activity.wait_event_type='Lock'
               AND $1::integer=ANY(pg_blocking_pids(activity.pid))
               AND position('FROM repositories' IN activity.query)>0
               AND position('FOR UPDATE' IN activity.query)>0`,
            [blockerPid],
          )
        ).rows[0]?.count,
      );
      if (waiting === 2) break;
      await setTimeout(20);
    }
    assert.equal(
      waiting,
      2,
      "Both independent PostgreSQL sessions must reach the held transition lock",
    );
  } finally {
    await blocker.query("COMMIT");
    blocker.release();
  }
  const results = await Promise.allSettled(competing);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(
    rejected?.status === "rejected" &&
      rejected.reason instanceof WbsError &&
      rejected.reason.status === 409,
  );
  const successfulIndex = results.findIndex((result) => result.status === "fulfilled");
  const winning = commands[successfulIndex];
  assert.ok(winning);
  const receipts = await Promise.all([
    executeWbsGovernanceCommand(governance, "owner", winning, 6),
    executeWbsGovernanceCommand(governance, "owner", winning, 7),
  ]);
  assert.deepEqual(receipts[0], receipts[1]);
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM app_private.repository_wbs_baselines")).rows[0]
        ?.count,
    ),
    1,
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM app_private.repository_wbs_governance_commands WHERE request_id=$1",
          [winning.requestId],
        )
      ).rows[0]?.count,
    ),
    1,
  );
});
