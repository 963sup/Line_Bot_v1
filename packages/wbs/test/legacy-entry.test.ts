import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createLegacyWbsEntry } from "../src/application/use-cases/legacy-entry.js";
import { createPostgresLegacyWbsEntryQuery } from "../src/composition/bootstrap/legacy-entry.js";

async function activeUser(db: Awaited<ReturnType<typeof postgresFixture>>["db"], id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
      [id],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
  });
}

test("legacy entry use case resolves the verified actor and publishes only the recovery decision", async () => {
  const calls: unknown[] = [];
  const legacy = createLegacyWbsEntry({
    activeUser: async (subject) => ({ id: `user:${subject}` }),
    query: () => ({
      read: async (userId, selector) => {
        calls.push({ userId, selector });
        return { entryRequired: true };
      },
    }),
  });

  assert.deepEqual(
    await legacy.read("line-subject", { ownerLogin: "owner", repositoryName: "Repo" }),
    {
      entryRequired: true,
    },
  );
  assert.deepEqual(calls, [
    {
      userId: "user:line-subject",
      selector: { ownerLogin: "owner", repositoryName: "Repo" },
    },
  ]);
});

test("Postgres legacy entry excludes cancelled intents and scopes live intent to the current actor", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner");
  await activeUser(db, "reader");
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','public')",
  );
  await pg.query(
    "INSERT INTO app_private.projects(id,owner_account_id,owner_account_kind,creator,name,version,created_at,updated_at) VALUES('project','owner','USER','owner','Target',1,1,1)",
  );
  const query = createPostgresLegacyWbsEntryQuery(db);
  assert.deepEqual(await query.read("owner", { repositoryId: "repo" }), {
    entryRequired: false,
  });

  await pg.exec("SET session_replication_role=replica");
  try {
    await pg.query(
      `INSERT INTO app_private.wbs_scope_transfers(
         id,repository_id,project_id,actor_user_id,request_id,state,source_version,
         source_head_revision_id,revision_count,command_count,source_hash,requested_at,
         cancelled_at,cancel_request_id
       ) VALUES($1,'repo','project','owner',$2,'CANCELLED',1,$3,1,1,$4,1,2,$5)`,
      [randomUUID(), randomUUID(), randomUUID(), "a".repeat(64), randomUUID()],
    );
  } finally {
    await pg.exec("SET session_replication_role=origin");
  }
  assert.deepEqual(await query.read("owner", { repositoryId: "repo" }), {
    entryRequired: false,
  });

  await pg.exec("SET session_replication_role=replica");
  try {
    await pg.query(
      `INSERT INTO app_private.wbs_scope_transfers(
         id,repository_id,project_id,actor_user_id,request_id,state,source_version,
         source_head_revision_id,revision_count,command_count,source_hash,requested_at
       ) VALUES($1,'repo','project','owner',$2,'REQUESTED',1,$3,1,1,$4,3)`,
      [randomUUID(), randomUUID(), randomUUID(), "b".repeat(64)],
    );
  } finally {
    await pg.exec("SET session_replication_role=origin");
  }
  assert.deepEqual(await query.read("owner", { repositoryId: "repo" }), {
    entryRequired: true,
  });
  assert.deepEqual(await query.read("reader", { repositoryId: "repo" }), {
    entryRequired: false,
  });
  await assert.rejects(query.read("missing", { repositoryId: "repo" }));
});

test("Postgres legacy entry detects durable source content for every authorized Repository reader", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner");
  await activeUser(db, "reader");
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','public')",
  );
  const revisionId = randomUUID();
  await pg.transaction(async (sql) => {
    await sql.query("SET CONSTRAINTS ALL DEFERRED");
    await sql.query(
      "INSERT INTO app_private.repository_wbs(repository_id,version,head_revision_id) VALUES('repo',1,$1)",
      [revisionId],
    );
    await sql.query(
      "INSERT INTO app_private.repository_wbs_revisions(id,repository_id,version,parent_revision_id,actor_user_id,action,document,at) VALUES($1,'repo',1,NULL,'owner','initialize',$2::jsonb,1)",
      [revisionId, JSON.stringify({ schemaVersion: 1, nodes: [] })],
    );
    await sql.query(
      "INSERT INTO app_private.repository_wbs_commands(actor_user_id,request_id,repository_id,fingerprint,revision_id) VALUES('owner',$1,'repo','receipt',$2)",
      [randomUUID(), revisionId],
    );
  });

  const query = createPostgresLegacyWbsEntryQuery(db);
  assert.deepEqual(await query.read("owner", { repositoryId: "repo" }), {
    entryRequired: true,
  });
  assert.deepEqual(await query.read("reader", { repositoryId: "repo" }), {
    entryRequired: true,
  });
});
