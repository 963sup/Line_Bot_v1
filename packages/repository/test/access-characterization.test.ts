import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryAccessStore } from "../src/composition/bootstrap/repository-access.js";
import type { RepositoryAccessCommand } from "../src/contracts/input/repository-access.js";
import { RepositoryError } from "../src/contracts/repository.js";
import {
  decideRepositoryAccess,
  RepositoryAccessDecisionError,
} from "../src/domain/repository/entities/repository.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [id],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
  });
}

test("Repository access Domain enforces owner scope before grant facts", () => {
  const repository = { id: "repo", ownerAccountId: "owner", ownerKind: "USER" as const };
  assert.throws(
    () =>
      decideRepositoryAccess(repository, {
        action: "grant",
        subjectKind: "USER",
        subjectId: "owner",
        capability: "admin",
        expectedVersion: 0,
      }),
    (error: unknown) =>
      error instanceof RepositoryAccessDecisionError && error.code === "implicit-user-owner",
  );
  assert.throws(
    () =>
      decideRepositoryAccess(repository, {
        action: "grant",
        subjectKind: "TEAM",
        subjectId: "team",
        capability: "read",
        expectedVersion: 0,
      }),
    (error: unknown) =>
      error instanceof RepositoryAccessDecisionError &&
      error.code === "team-requires-organization-owner",
  );
});

test("Repository access Domain rejects stale versions and accepts current qualified grants", () => {
  const repository = { id: "repo", ownerAccountId: "owner", ownerKind: "USER" as const };
  const change = {
    action: "grant" as const,
    subjectKind: "USER" as const,
    subjectId: "target",
    capability: "write" as const,
    expectedVersion: 1,
  };
  assert.throws(
    () =>
      decideRepositoryAccess(repository, change, {
        currentGrant: { capability: "read", version: 2 },
      }),
    (error: unknown) =>
      error instanceof RepositoryAccessDecisionError && error.code === "version-conflict",
  );
  assert.deepEqual(
    decideRepositoryAccess(repository, change, {
      currentGrant: { capability: "read", version: 1 },
      targetUserActive: true,
    }),
    {
      kind: "accepted",
      mutation: {
        subjectKind: "USER",
        subjectId: "target",
        capability: "write",
        expectedVersion: 1,
      },
    },
  );
});

test("Repository access rechecks delegated authority before replay and preserves SQL error priority", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const userId of ["owner", "actor", "target"]) await activeUser(db, userId);
  await pg.query(
    "INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) VALUES('repo','owner','USER','Repo','private',1)",
  );

  const store = new PostgresRepositoryAccessStore(db);
  await store.execute(
    "owner",
    {
      action: "grant",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "actor",
      capability: "admin",
      expectedVersion: 0,
    },
    10,
  );
  const delegatedCommand = {
    action: "grant" as const,
    requestId: "22222222-2222-4222-8222-222222222222",
    repositoryId: "repo",
    subjectKind: "USER" as const,
    subjectId: "target",
    capability: "read" as const,
    expectedVersion: 0,
  };
  const delegatedReceipt = await store.execute("actor", delegatedCommand, 11);
  assert.deepEqual(delegatedReceipt, {
    requestId: delegatedCommand.requestId,
    repositoryId: "repo",
    subjectKind: "USER",
    subjectId: "target",
    capability: "read",
    version: 1,
    at: 11,
  });
  await store.execute(
    "owner",
    {
      action: "revoke",
      requestId: "33333333-3333-4333-8333-333333333333",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "actor",
      expectedVersion: 1,
    },
    12,
  );
  await assert.rejects(
    store.execute("actor", delegatedCommand, 13),
    (error: unknown) =>
      error instanceof RepositoryError &&
      error.status === 403 &&
      error.message === "沒有此 Repository 的 access 管理權限。",
  );

  await pg.query(
    "UPDATE app_private.users SET status='paused',status_version=status_version+1 WHERE id='target'",
  );
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "grant",
        requestId: "99999999-9999-4999-8999-999999999999",
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "target",
        capability: "read",
        expectedVersion: -1,
      },
      14,
    ),
    (error: unknown) =>
      error instanceof RepositoryError &&
      error.status === 400 &&
      error.message === "Repository access 操作格式不正確。",
  );
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "grant",
        requestId: "44444444-4444-4444-8444-444444444444",
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "target",
        capability: "read",
        expectedVersion: 0,
      },
      15,
    ),
    (error: unknown) =>
      error instanceof RepositoryError &&
      error.status === 409 &&
      error.message === "Repository access 狀態已變更，請重新載入。",
  );
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "grant",
        requestId: "55555555-5555-4555-8555-555555555555",
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "target",
        capability: "read",
        expectedVersion: 1,
      },
      16,
    ),
    (error: unknown) =>
      error instanceof RepositoryError &&
      error.status === 403 &&
      error.message === "Repository access 資格不符。",
  );

  assert.deepEqual(
    (
      await pg.query(
        `SELECT capability,version,
                (SELECT count(*)::int FROM app_private.repository_commands WHERE actor='actor') AS actor_receipt_count,
                (SELECT count(*)::int FROM app_private.repository_commands) AS total_receipt_count
         FROM app_private.repository_access
         WHERE repository_id='repo' AND principal_id='target'`,
      )
    ).rows,
    [{ capability: "read", version: 1, actor_receipt_count: 1, total_receipt_count: 3 }],
  );
});

test("typed Repository access snapshots caller-owned subject before transaction work", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const userId of ["owner", "before", "after"]) await activeUser(db, userId);
  await pg.query(
    "INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) VALUES('repo','owner','USER','Repo','private',1)",
  );

  const caller = {
    action: "grant" as const,
    requestId: "66666666-6666-4666-8666-666666666666",
    repositoryId: "repo",
    subjectKind: "USER" as const,
    subjectId: "before",
    capability: "read" as const,
    expectedVersion: 0,
  };
  const original: RepositoryAccessCommand = { ...caller };
  const mutatingDatabase: Database = {
    transaction(work) {
      caller.subjectId = "after";
      return db.transaction(work);
    },
  };
  const receipt = await new PostgresRepositoryAccessStore(mutatingDatabase).execute(
    "owner",
    caller,
    20,
  );
  const rows = (
    await pg.query(
      `SELECT principal_id,capability,version
       FROM app_private.repository_access
       WHERE repository_id='repo' AND principal_id IN ('before','after')
       ORDER BY principal_id`,
    )
  ).rows;
  const commands = (
    await pg.query(
      `SELECT fingerprint,result
       FROM app_private.repository_commands
       WHERE actor='owner' AND request_id=$1`,
      [original.requestId],
    )
  ).rows;
  const expectedFingerprint = createHash("sha256")
    .update(JSON.stringify({ family: "repository-access", command: original }))
    .digest("hex");

  assert.deepEqual(
    { receipt, rows, commands },
    {
      receipt: {
        requestId: original.requestId,
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "before",
        capability: "read",
        version: 1,
        at: 20,
      },
      rows: [{ principal_id: "before", capability: "read", version: 1 }],
      commands: [
        {
          fingerprint: expectedFingerprint,
          result: {
            receiptVersion: 1,
            family: "repository-access",
            action: "grant",
            result: {
              requestId: original.requestId,
              repositoryId: "repo",
              subjectKind: "USER",
              subjectId: "before",
              capability: "read",
              version: 1,
              at: 20,
            },
          },
        },
      ],
    },
  );
});
