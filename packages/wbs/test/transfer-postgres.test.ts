import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { createSql } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createProjectManagement } from "@line_bot_v1/project/application/management";
import {
  createPostgresProjectLifecycle,
  createPostgresProjectManagementStore,
} from "@line_bot_v1/project/composition/bootstrap/postgres-project-management-store";
import { createPostgresProjectContentScope } from "@line_bot_v1/project/composition/bootstrap/project-content-scope";
import { ProjectError } from "@line_bot_v1/project/domain";
import { executeWbsCommand } from "../src/application/use-cases/content.js";
import { executeWbsGovernanceCommand } from "../src/application/use-cases/governance.js";
import { executeProjectWbsCommand } from "../src/application/use-cases/project-content.js";
import {
  cancelWbsScopeTransfer,
  executeWbsScopeTransfer,
  readActiveWbsScopeTransfer,
  readWbsScopeTransfer,
  requestWbsScopeTransfer,
} from "../src/application/use-cases/transfer.js";
import { createPostgresProjectWbsStore } from "../src/composition/bootstrap/project-content.js";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "../src/composition/bootstrap/store.js";
import { createPostgresWbsScopeTransferStore } from "../src/composition/bootstrap/transfer.js";
import { WbsError } from "../src/domain/document.js";

const releaseSha = "a".repeat(40);

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [id],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
  });
}

function operatorDatabase(
  transaction: <T>(work: (sql: Sql) => Promise<T>) => Promise<T>,
): Database {
  return { transaction };
}

function pgliteOperatorDatabase(pg: Awaited<ReturnType<typeof postgresFixture>>["pg"]): Database {
  return operatorDatabase((work) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL search_path=app_private,pg_catalog");
      return work(
        createSql(async (text, values) => {
          const result = await tx.query<SqlRow>(text, values);
          return { rows: result.rows, rowCount: result.affectedRows ?? null };
        }),
      );
    }),
  );
}

function transferStore(requestDb: Database, operatorDb: Database) {
  return createPostgresWbsScopeTransferStore(
    requestDb,
    (sql) => ({
      project: async (userId, projectId) => {
        const scope = await createPostgresProjectContentScope(sql).read(userId, projectId);
        return {
          projectId: scope.project.id,
          ownerAccountId: scope.project.ownerAccountId,
          ownerKind: scope.project.ownerKind,
          role: scope.role,
          public: scope.project.public,
          closed: scope.closed,
          hasCollaboratorGrants: scope.project.hasCollaboratorGrants,
        };
      },
      dependents: async () => ({ actionRows: 0, notificationRows: 0 }),
    }),
    operatorDb,
  );
}

async function buildSourceAndTarget(args: {
  db: Database;
  provisionRepository(sql: string): Promise<unknown>;
}) {
  await activeUser(args.db, "owner");
  await activeUser(args.db, "outsider");
  await args.provisionRepository(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','public')",
  );
  const project = createProjectManagement({
    activeUser: async (subject) => ({ id: subject }),
    store: () => createPostgresProjectManagementStore(args.db),
    lifecycle: () => createPostgresProjectLifecycle(args.db),
    now: () => 5,
  });
  const created = await project.command("owner", {
    action: "create-project",
    requestId: randomUUID(),
    ownerAccountId: "owner",
    ownerKind: "USER",
    expectedVersion: 0,
    title: "Transferred scope",
    public: false,
    repositoryId: null,
    teamId: null,
  });
  const content = createPostgresWbsStore(args.db);
  const requestIds: string[] = [];
  const commands = [
    { action: "initialize" as const },
    {
      action: "create-node" as const,
      node: {
        id: "deliverable",
        parentId: null,
        position: 0,
        kind: "DELIVERABLE" as const,
        title: "Delivery",
        description: "",
        deliverable: "",
        acceptanceCriteria: "",
      },
    },
    {
      action: "create-node" as const,
      node: {
        id: "work-1",
        parentId: "deliverable",
        position: 0,
        kind: "WORK_PACKAGE" as const,
        title: "Work one",
        description: "One",
        deliverable: "One result",
        acceptanceCriteria: "One checked",
      },
    },
    {
      action: "create-node" as const,
      node: {
        id: "work-2",
        parentId: "deliverable",
        position: 1,
        kind: "WORK_PACKAGE" as const,
        title: "Work two",
        description: "Two",
        deliverable: "Two result",
        acceptanceCriteria: "Two checked",
      },
    },
    {
      action: "update-node" as const,
      node: {
        id: "work-2",
        parentId: "deliverable",
        position: 1,
        kind: "WORK_PACKAGE" as const,
        title: "Work two revised",
        description: "Two",
        deliverable: "Two result",
        acceptanceCriteria: "Two verified",
      },
    },
  ];
  let head = "";
  for (const [expectedVersion, edit] of commands.entries()) {
    const requestId = randomUUID();
    requestIds.push(requestId);
    const receipt = await executeWbsCommand(
      content,
      "owner",
      { ...edit, repositoryId: "repo", requestId, expectedVersion },
      100 + expectedVersion,
    );
    head = receipt.revision.id;
  }
  return { projectId: created.projectId, head, requestIds };
}

async function requestTransfer(
  store: ReturnType<typeof transferStore>,
  projectId: string,
  head: string,
) {
  const command = {
    transferId: randomUUID(),
    requestId: randomUUID(),
    repositoryId: "repo",
    projectId,
    sourceVersion: 5,
    sourceHeadRevisionId: head,
  };
  return {
    command,
    intent: await requestWbsScopeTransfer(store, "owner", command, 200),
  };
}

test("PGlite transfers exact history and receipts, then enforces the one-way authority fence", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const built = await buildSourceAndTarget({
    db,
    provisionRepository: (sql) => pg.query(sql),
  });
  const store = transferStore(db, pgliteOperatorDatabase(pg));
  const { command, intent } = await requestTransfer(store, built.projectId, built.head);
  assert.equal(intent.state, "REQUESTED");
  assert.equal(intent.revisionCount, 5);
  assert.equal(intent.commandCount, 5);

  await assert.rejects(
    requestWbsScopeTransfer(store, "outsider", { ...command, requestId: randomUUID() }, 201),
    (error: unknown) => error instanceof ProjectError && error.status === 404,
  );
  const projectGrantCount = await pg.query<{ count: number | string }>(
    `SELECT
       (SELECT count(*) FROM project_user_access WHERE project_id=$1)
       +(SELECT count(*) FROM project_team_access WHERE project_id=$1) AS count`,
    [built.projectId],
  );
  assert.equal(Number(projectGrantCount.rows[0]?.count), 0);

  const source = await pg.query(
    `SELECT id,version,parent_revision_id,actor_user_id,action,document,at
     FROM app_private.repository_wbs_revisions WHERE repository_id='repo' ORDER BY version`,
  );
  const sourceReceipts = await pg.query(
    `SELECT actor_user_id,request_id,repository_id,fingerprint,revision_id
     FROM app_private.repository_wbs_commands WHERE repository_id='repo'
     ORDER BY actor_user_id,request_id`,
  );
  const active = await executeWbsScopeTransfer(
    store,
    {
      transferId: command.transferId,
      currentMainSha: releaseSha,
      deployedSha: releaseSha,
      providerRecoveryReady: true,
    },
    300,
  );
  assert.equal(active.state, "ACTIVE");
  const target = await pg.query(
    `SELECT id,version,parent_revision_id,actor_user_id,action,document,at
     FROM app_private.project_wbs_revisions WHERE project_id=$1 ORDER BY version`,
    [built.projectId],
  );
  assert.deepEqual(target.rows, source.rows);
  assert.deepEqual(
    (
      await pg.query(
        `SELECT actor_user_id,request_id,repository_id,fingerprint,revision_id
         FROM app_private.legacy_wbs_command_evidence WHERE project_id=$1
         ORDER BY actor_user_id,request_id`,
        [built.projectId],
      )
    ).rows,
    sourceReceipts.rows,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT version,head_revision_id FROM app_private.project_wbs WHERE project_id=$1",
        [built.projectId],
      )
    ).rows[0],
    { version: 5, head_revision_id: built.head },
  );
  await assert.rejects(
    pg.query(
      "UPDATE app_private.legacy_wbs_command_evidence SET fingerprint='changed' WHERE project_id=$1",
      [built.projectId],
    ),
    /legacy_wbs_evidence_immutable/,
  );

  await db.transaction(async (sql) => {
    assert.equal(
      (await sql.query("SELECT * FROM repository_wbs WHERE repository_id='repo'")).rows.length,
      0,
    );
  });
  await assert.rejects(
    db.transaction((sql) =>
      sql.query(
        "INSERT INTO repository_wbs_commands(actor_user_id,request_id,repository_id,fingerprint,revision_id) VALUES('owner',$1,'repo','blocked',$2)",
        [randomUUID(), built.head],
      ),
    ),
    /repository_wbs_transferred|row-level security/,
  );

  const projectContent = createPostgresProjectWbsStore(db);
  await assert.rejects(
    executeProjectWbsCommand(
      projectContent,
      "owner",
      {
        action: "create-node",
        projectId: built.projectId,
        requestId: built.requestIds[0] ?? "",
        expectedVersion: 5,
        node: {
          id: "legacy-replay",
          parentId: null,
          position: 0,
          kind: "WORK_PACKAGE",
          title: "Legacy replay",
          description: "",
          deliverable: "Result",
          acceptanceCriteria: "Checked",
        },
      },
      400,
    ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
  const postTransferCommand = {
    action: "create-node" as const,
    projectId: built.projectId,
    requestId: randomUUID(),
    expectedVersion: 5,
    node: {
      id: "post-transfer",
      parentId: null,
      position: 1,
      kind: "WORK_PACKAGE" as const,
      title: "Project authority",
      description: "",
      deliverable: "Result",
      acceptanceCriteria: "Checked",
    },
  };
  const postTransfer = await executeProjectWbsCommand(
    projectContent,
    "owner",
    postTransferCommand,
    401,
  );
  assert.deepEqual(
    await executeProjectWbsCommand(projectContent, "owner", postTransferCommand, 999),
    postTransfer,
  );
  assert.equal((await readActiveWbsScopeTransfer(store, command.transferId))?.state, "ACTIVE");
  const retriedActive = await executeWbsScopeTransfer(
    store,
    {
      transferId: command.transferId,
      currentMainSha: "stale-after-commit",
      deployedSha: "different-after-commit",
      providerRecoveryReady: false,
    },
    999,
  );
  assert.equal(retriedActive.state, "ACTIVE");
  assert.equal(retriedActive.sourceVersion, 5);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','public')",
  );
  await assert.rejects(
    executeWbsCommand(
      createPostgresWbsStore(db),
      "owner",
      {
        action: "initialize",
        repositoryId: "other",
        requestId: randomUUID(),
        expectedVersion: 0,
      },
      1000,
    ),
    (error: unknown) => error instanceof WbsError && error.status === 410,
  );
});

test("PGlite rolls back the entire transfer when replay evidence persistence fails", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const built = await buildSourceAndTarget({
    db,
    provisionRepository: (sql) => pg.query(sql),
  });
  const operatorDb = operatorDatabase((work) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL search_path=app_private,pg_catalog");
      return work(
        createSql(async (text, values) => {
          if (text.includes("INSERT INTO legacy_wbs_command_evidence")) {
            throw new Error("injected replay evidence write failure");
          }
          const result = await tx.query<SqlRow>(text, values);
          return { rows: result.rows, rowCount: result.affectedRows ?? null };
        }),
      );
    }),
  );
  const store = transferStore(db, operatorDb);
  const { command } = await requestTransfer(store, built.projectId, built.head);

  await assert.rejects(
    executeWbsScopeTransfer(
      store,
      {
        transferId: command.transferId,
        currentMainSha: releaseSha,
        deployedSha: releaseSha,
        providerRecoveryReady: true,
      },
      300,
    ),
    /injected replay evidence write failure/,
  );

  assert.equal(
    Number(
      (
        await pg.query("SELECT count(*) FROM app_private.project_wbs WHERE project_id=$1", [
          built.projectId,
        ])
      ).rows[0]?.count,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await pg.query(
          "SELECT count(*) FROM app_private.project_wbs_revisions WHERE project_id=$1",
          [built.projectId],
        )
      ).rows[0]?.count,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await pg.query(
          "SELECT count(*) FROM app_private.legacy_wbs_command_evidence WHERE project_id=$1",
          [built.projectId],
        )
      ).rows[0]?.count,
    ),
    0,
  );
  assert.equal(
    (
      await pg.query<{ state: string }>(
        "SELECT state FROM app_private.wbs_scope_transfers WHERE id=$1",
        [command.transferId],
      )
    ).rows[0]?.state,
    "REQUESTED",
  );
  assert.equal(
    Number(
      (
        await pg.query(
          "SELECT count(*) FROM app_private.repository_wbs_revisions WHERE repository_id='repo'",
        )
      ).rows[0]?.count,
    ),
    5,
  );
});

test("PGlite aborts atomically when source history or governance changes after REQUESTED", async (t) => {
  for (const change of ["content", "governance", "additional-root"] as const) {
    const { pg, db } = await postgresFixture();
    t.after(() => pg.close());
    const built = await buildSourceAndTarget({
      db,
      provisionRepository: (sql) => pg.query(sql),
    });
    const store = transferStore(db, pgliteOperatorDatabase(pg));
    const { command } = await requestTransfer(store, built.projectId, built.head);
    if (change === "content") {
      await executeWbsCommand(
        createPostgresWbsStore(db),
        "owner",
        {
          action: "create-node",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: 5,
          node: {
            id: "late-source-write",
            parentId: null,
            position: 1,
            kind: "WORK_PACKAGE",
            title: "Late source write",
            description: "",
            deliverable: "Result",
            acceptanceCriteria: "Checked",
          },
        },
        250,
      );
    } else if (change === "governance") {
      const governance = createPostgresWbsGovernanceStore(db);
      const view = await governance.view("owner", { repositoryId: "repo" }, {});
      await executeWbsGovernanceCommand(
        governance,
        "owner",
        {
          action: "create-proposal",
          repositoryId: "repo",
          requestId: randomUUID(),
          expectedVersion: view.version,
          title: "Late governance",
          reason: "",
          candidateRevisionId: built.head,
          baseBaselineId: null,
        },
        251,
      );
    } else {
      await pg.query(
        "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','public')",
      );
      await executeWbsCommand(
        createPostgresWbsStore(db),
        "owner",
        {
          action: "initialize",
          repositoryId: "other",
          requestId: randomUUID(),
          expectedVersion: 0,
        },
        252,
      );
    }
    await assert.rejects(
      executeWbsScopeTransfer(
        store,
        {
          transferId: command.transferId,
          currentMainSha: releaseSha,
          deployedSha: releaseSha,
          providerRecoveryReady: true,
        },
        300,
      ),
      (error: unknown) => error instanceof WbsError && error.status === 409,
    );
    assert.equal(
      Number(
        (
          await pg.query<{ count: number | string }>(
            "SELECT count(*) AS count FROM app_private.project_wbs WHERE project_id=$1",
            [built.projectId],
          )
        ).rows[0]?.count,
      ),
      0,
    );
    assert.equal(
      (
        await pg.query<{ state: string }>(
          "SELECT state FROM app_private.wbs_scope_transfers WHERE id=$1",
          [command.transferId],
        )
      ).rows[0]?.state,
      "REQUESTED",
    );
  }
});

test("PGlite request preflight leaves no reservation when dependent state exists", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const built = await buildSourceAndTarget({ db, provisionRepository: (sql) => pg.query(sql) });
  const governance = createPostgresWbsGovernanceStore(db);
  const view = await governance.view("owner", { repositoryId: "repo" }, {});
  await executeWbsGovernanceCommand(
    governance,
    "owner",
    {
      action: "create-proposal",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: view.version,
      title: "Existing governance",
      reason: "",
      candidateRevisionId: built.head,
      baseBaselineId: null,
    },
    260,
  );
  await assert.rejects(
    requestTransfer(transferStore(db, pgliteOperatorDatabase(pg)), built.projectId, built.head),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
  assert.equal(
    Number(
      (
        await pg.query<{ count: number | string }>(
          "SELECT count(*) AS count FROM app_private.wbs_scope_transfers",
        )
      ).rows[0]?.count,
    ),
    0,
  );
});

test("PGlite owner cancels a stranded intent and replans before Project deletion", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const built = await buildSourceAndTarget({ db, provisionRepository: (sql) => pg.query(sql) });
  const store = transferStore(db, pgliteOperatorDatabase(pg));
  const first = await requestTransfer(store, built.projectId, built.head);
  const changed = await executeWbsCommand(
    createPostgresWbsStore(db),
    "owner",
    {
      action: "create-node",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 5,
      node: {
        id: "changed-after-request",
        parentId: null,
        position: 1,
        kind: "WORK_PACKAGE",
        title: "Changed",
        description: "",
        deliverable: "Result",
        acceptanceCriteria: "Checked",
      },
    },
    250,
  );
  await assert.rejects(
    executeWbsScopeTransfer(
      store,
      {
        transferId: first.command.transferId,
        currentMainSha: releaseSha,
        deployedSha: releaseSha,
        providerRecoveryReady: true,
      },
      300,
    ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE wbs_scope_transfers SET state='ACTIVE' WHERE id=$1", [
        first.command.transferId,
      ]),
    ),
    /wbs_scope_transfer_cancel_only|row-level security|check constraint/,
  );
  const cancelRequestId = randomUUID();
  const cancelled = await cancelWbsScopeTransfer(
    store,
    "owner",
    {
      transferId: first.command.transferId,
      repositoryId: "repo",
      requestId: cancelRequestId,
    },
    310,
  );
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(cancelled.cancelRequestId, cancelRequestId);
  assert.deepEqual(
    await cancelWbsScopeTransfer(
      store,
      "owner",
      {
        transferId: first.command.transferId,
        repositoryId: "repo",
        requestId: cancelRequestId,
      },
      999,
    ),
    cancelled,
  );
  assert.equal(await readWbsScopeTransfer(store, "owner", "repo"), null);
  assert.equal(await readActiveWbsScopeTransfer(store, first.command.transferId), null);

  const secondCommand = {
    transferId: randomUUID(),
    requestId: randomUUID(),
    repositoryId: "repo",
    projectId: built.projectId,
    sourceVersion: 6,
    sourceHeadRevisionId: changed.revision.id,
  };
  const second = await requestWbsScopeTransfer(store, "owner", secondCommand, 320);
  assert.equal(second.state, "REQUESTED");
  assert.equal((await readWbsScopeTransfer(store, "owner", "repo"))?.id, second.id);
  await assert.rejects(
    cancelWbsScopeTransfer(
      store,
      "owner",
      { transferId: second.id, repositoryId: "repo", requestId: cancelRequestId },
      325,
    ),
    (error: unknown) => error instanceof WbsError && error.status === 409,
  );

  const project = createProjectManagement({
    activeUser: async (subject) => ({ id: subject }),
    store: () => createPostgresProjectManagementStore(db),
    lifecycle: () => createPostgresProjectLifecycle(db),
    now: () => 330,
  });
  await project.command("owner", {
    action: "delete-project",
    requestId: randomUUID(),
    projectId: built.projectId,
    expectedVersion: 1,
  });
  const cancelledAfterDelete = await cancelWbsScopeTransfer(
    store,
    "owner",
    { transferId: second.id, repositoryId: "repo", requestId: randomUUID() },
    340,
  );
  assert.equal(cancelledAfterDelete.state, "CANCELLED");
});

const databaseUrl = process.env.WBS_TEST_DATABASE_URL;
test("real PostgreSQL drains an old shared writer before ACTIVE fences its delayed source write", {
  skip: !databaseUrl && !process.env.CI,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const url = new URL(databaseUrl);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Transfer races only use a local disposable server",
  );
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  const built = await buildSourceAndTarget({
    db,
    provisionRepository: (sql) => pool.query(sql),
  });
  const operatorDb = operatorDatabase(async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;SET LOCAL search_path=app_private,pg_catalog");
      const value = await work(
        createSql(async (text, values) => {
          const result = await client.query<SqlRow>(text, values);
          return { rows: result.rows, rowCount: result.rowCount };
        }),
      );
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
  const store = transferStore(db, operatorDb);
  const { command } = await requestTransfer(store, built.projectId, built.head);
  const blocker = await pool.connect();
  await blocker.query(
    "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog;SELECT app_private.lock_governance('shared')",
  );
  const blockerPid = Number((await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
  const executing = executeWbsScopeTransfer(
    store,
    {
      transferId: command.transferId,
      currentMainSha: releaseSha,
      deployedSha: releaseSha,
      providerRecoveryReady: true,
    },
    300,
  );
  await waitForBlocked(blockerPid);
  const cancelling = cancelWbsScopeTransfer(
    store,
    "owner",
    { transferId: command.transferId, repositoryId: "repo", requestId: randomUUID() },
    301,
  ).then(
    (value) => ({ outcome: "fulfilled" as const, value }),
    (error: unknown) => ({ error, outcome: "rejected" as const }),
  );
  const delayedWrite = executeWbsCommand(
    createPostgresWbsStore(db),
    "owner",
    {
      action: "create-node",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 5,
      node: {
        id: "delayed-source-write",
        parentId: null,
        position: 1,
        kind: "WORK_PACKAGE",
        title: "Delayed source write",
        description: "",
        deliverable: "Result",
        acceptanceCriteria: "Checked",
      },
    },
    302,
  ).then(
    (value) => ({ outcome: "fulfilled" as const, value }),
    (error: unknown) => ({ error, outcome: "rejected" as const }),
  );
  try {
    assert.equal(
      await Promise.race([
        Promise.race([delayedWrite, cancelling]).then(() => "settled" as const),
        delay(50, "pending" as const),
      ]),
      "pending",
    );
  } finally {
    await blocker.query("COMMIT");
    blocker.release();
  }
  assert.equal((await executing).state, "ACTIVE");
  const cancelResult = await cancelling;
  assert.equal(cancelResult.outcome, "rejected");
  assert.ok(cancelResult.outcome === "rejected");
  assert.ok(cancelResult.error instanceof WbsError);
  assert.equal(cancelResult.error.status, 409);
  const delayedResult = await delayedWrite;
  assert.equal(delayedResult.outcome, "rejected");
  assert.ok(delayedResult.outcome === "rejected");
  assert.ok(delayedResult.error instanceof WbsError);
  assert.equal(delayedResult.error.status, 410);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM app_private.repository_wbs_revisions WHERE repository_id='repo'",
        )
      ).rows[0]?.count,
    ),
    5,
  );
});
