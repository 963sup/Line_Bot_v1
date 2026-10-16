import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryManagementStore } from "../src/composition/bootstrap/repository-management.js";
import type { RepositoryManagementCommand } from "../src/contracts/input/repository-management.js";
import { RepositoryError } from "../src/contracts/repository.js";
import {
  decideRepositoryLifecycle,
  RepositoryLifecycleError,
} from "../src/domain/repository/entities/repository.js";

test("INTERNAL lifecycle rejects an empty Enterprise identity", () => {
  assert.throws(
    () =>
      decideRepositoryLifecycle(
        {
          id: "repo",
          ownerAccountId: "org",
          ownerKind: "ORGANIZATION",
          name: "Alpha",
          visibility: "private",
          archived: false,
          version: 1,
        },
        { action: "visibility", expectedVersion: 1, visibility: "internal" },
        { internalEnterpriseId: "" },
      ),
    (error) =>
      error instanceof RepositoryLifecycleError && error.code === "internal-enterprise-required",
  );
});

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

async function existingRepository(
  pg: Awaited<ReturnType<typeof postgresFixture>>["pg"],
  id: string,
  ownerAccountId: string,
  ownerKind: "USER" | "ORGANIZATION",
) {
  await pg.transaction(async (sql) => {
    await sql.query(
      `insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version)
       values($1,$2,$3,'Alpha','private',1)`,
      [id, ownerAccountId, ownerKind],
    );
    await sql.query(
      `select app_private.claim_scoped_namespace_name(
         'repository-name','OWNER_ACCOUNT',$1,'REPOSITORY',$2,'Alpha',2
       )`,
      [ownerAccountId, id],
    );
  });
}

async function repositoryEvidence(
  pg: Awaited<ReturnType<typeof postgresFixture>>["pg"],
  id: string,
) {
  const [repository, history, events, commands] = await Promise.all([
    pg.query(
      "select name,visibility,is_archived,version from app_private.repositories where id=$1",
      [id],
    ),
    pg.query(
      `select action,old_name,new_name,changed_at
       from app_private.namespace_binding_history
       where family='repository-name' and target_kind='REPOSITORY' and target_id=$1
       order by binding_version`,
      [id],
    ),
    pg.query(
      "select actor_user_id,action,previous_state,current_state,at from app_private.repository_events where repository_id=$1 order by id",
      [id],
    ),
    pg.query(
      `select actor,request_id,fingerprint,result,at
       from app_private.repository_commands
       where result->'result'->>'repositoryId'=$1
       order by actor,request_id`,
      [id],
    ),
  ]);
  return {
    repository: repository.rows,
    history: history.rows,
    events: events.rows,
    commands: commands.rows,
  };
}

test("exact rename replay rechecks current User and OrganizationOwner authority", async () => {
  for (const ownerKind of ["USER", "ORGANIZATION"] as const) {
    const { pg, db } = await postgresFixture();
    try {
      await activeUser(db, "owner", ownerKind === "USER" ? "alice" : "owner");
      if (ownerKind === "ORGANIZATION") {
        await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
          "org",
          "owner",
          "org",
          "Organization",
          2,
        ]);
      }
      const ownerAccountId = ownerKind === "USER" ? "owner" : "org";
      const repositoryId = ownerKind === "USER" ? "user-repo" : "org-repo";
      await existingRepository(pg, repositoryId, ownerAccountId, ownerKind);

      const store = new PostgresRepositoryManagementStore(db);
      const command = {
        action: "rename" as const,
        requestId:
          ownerKind === "USER"
            ? "11111111-1111-4111-8111-111111111111"
            : "22222222-2222-4222-8222-222222222222",
        repositoryId,
        expectedVersion: 1,
        name: "Beta",
      };
      const renamed = await store.execute("owner", command, 10);
      assert.deepEqual(await store.execute("owner", command, 11), renamed);
      const beforeRevocation = await repositoryEvidence(pg, repositoryId);

      if (ownerKind === "USER") {
        await pg.query(
          "update app_private.users set status='paused',status_version=status_version+1 where id='owner'",
        );
      } else {
        await pg.query(
          `update app_private.organization_role_assignments
           set status='revoked',version=version+1
           where organization_account_id='org'
             and user_id='owner'
             and role='OrganizationOwner'`,
        );
      }

      await assert.rejects(
        store.execute("owner", command, 12),
        (error) => error instanceof RepositoryError && error.status === 403,
      );
      assert.deepEqual(await repositoryEvidence(pg, repositoryId), beforeRevocation);
    } finally {
      await pg.close();
    }
  }
});

test("same request with a different rename payload is rejected without side effects", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "alice");
  await existingRepository(pg, "repo", "owner", "USER");

  const store = new PostgresRepositoryManagementStore(db);
  const command = {
    action: "rename" as const,
    requestId: "33333333-3333-4333-8333-333333333333",
    repositoryId: "repo",
    expectedVersion: 1,
    name: "Beta",
  };
  await store.execute("owner", command, 10);
  const beforeConflict = await repositoryEvidence(pg, "repo");

  await assert.rejects(
    store.execute("owner", { ...command, name: "Gamma" }, 11),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  assert.deepEqual(await repositoryEvidence(pg, "repo"), beforeConflict);
});

test("stale rename expectedVersion rolls back all state and durable evidence", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "alice");
  await existingRepository(pg, "repo", "owner", "USER");
  const beforeConflict = await repositoryEvidence(pg, "repo");

  const store = new PostgresRepositoryManagementStore(db);
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "rename",
        requestId: "44444444-4444-4444-8444-444444444444",
        repositoryId: "repo",
        expectedVersion: 2,
        name: "Beta",
      },
      10,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  assert.deepEqual(await repositoryEvidence(pg, "repo"), beforeConflict);
});

test("rename snapshots a mutable caller command before entering its transaction", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "alice");
  await existingRepository(pg, "repo", "owner", "USER");

  const command: Extract<RepositoryManagementCommand, { action: "rename" }> = {
    action: "rename",
    requestId: "55555555-5555-4555-8555-555555555555",
    repositoryId: "repo",
    expectedVersion: 1,
    name: "Before",
  };
  const originalCommand = { ...command };
  const decoratedDatabase: Database = {
    transaction(work) {
      command.name = "After";
      return db.transaction(work);
    },
  };

  const receipt = await new PostgresRepositoryManagementStore(decoratedDatabase).execute(
    "owner",
    command,
    10,
  );
  const expectedFingerprint = createHash("sha256")
    .update(JSON.stringify({ family: "repository-management", command: originalCommand }))
    .digest("hex");
  const durable = await pg.query(
    `select
       r.name,
       r.version,
       e.current_state->>'name' as event_name,
       c.fingerprint,
       c.result->'result'->>'name' as receipt_name,
       c.result->'result'->>'version' as receipt_version
     from app_private.repositories r
     join app_private.repository_events e on e.repository_id=r.id
     join app_private.repository_commands c
       on c.actor='owner' and c.request_id=$1
     where r.id='repo'`,
    [command.requestId],
  );

  assert.equal(command.name, "After");
  assert.deepEqual(durable.rows, [
    {
      name: "Before",
      version: 2,
      event_name: "Before",
      fingerprint: expectedFingerprint,
      receipt_name: "Before",
      receipt_version: "2",
    },
  ]);
  assert.equal(receipt.name, "Before");
});
