import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryCreationStore } from "../src/composition/bootstrap/repository-creation.js";
import { PostgresRepositoryManagementStore } from "../src/composition/bootstrap/repository-management.js";
import { RepositoryError } from "../src/contracts/errors/repository-error.js";
import type { RepositoryCreateCommand } from "../src/contracts/input/repository-creation.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("legacy PRIVATE fingerprint replays without creating another Repository or receipt", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "creator", "alice");
  const store = new PostgresRepositoryCreationStore(db);
  const command: RepositoryCreateCommand = {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "creator",
    ownerKind: "USER",
    name: "Alpha",
    visibility: "private",
  };
  const created = await store.create("creator", command, 10);
  const legacyFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        requestId: command.requestId,
        ownerAccountId: command.ownerAccountId,
        ownerKind: command.ownerKind,
        name: command.name,
      }),
    )
    .digest("hex");
  await pg.query(
    "update app_private.repository_commands set fingerprint=$1 where actor='creator' and request_id=$2",
    [legacyFingerprint, command.requestId],
  );

  assert.deepEqual(await store.create("creator", command, 11), created);
  const evidence = await pg.query(`select
      (select count(*)::int from app_private.repositories) as repositories,
      (select count(*)::int from app_private.repository_commands) as receipts,
      (select fingerprint from app_private.repository_commands where actor='creator') as fingerprint`);
  assert.deepEqual(evidence.rows, [
    { repositories: 1, receipts: 1, fingerprint: legacyFingerprint },
  ]);
});

test("creation replay rechecks current User and Organization visibility capability", async () => {
  {
    const { pg, db } = await postgresFixture();
    try {
      await activeUser(db, "creator", "alice");
      const store = new PostgresRepositoryCreationStore(db);
      const command: RepositoryCreateCommand = {
        requestId: "22222222-2222-4222-8222-222222222222",
        ownerAccountId: "creator",
        ownerKind: "USER",
        name: "Personal",
        visibility: "private",
      };
      const created = await store.create("creator", command, 10);
      await pg.query(
        "update app_private.users set status='paused',status_version=status_version+1 where id='creator'",
      );
      await assert.rejects(
        store.create("creator", command, 11),
        (error) =>
          error instanceof RepositoryError &&
          error.status === 403 &&
          error.message === "目前 User 資格不能建立 Repository。",
      );
      assert.deepEqual((await pg.query("select id,name from app_private.repositories")).rows, [
        { id: created.id, name: "Personal" },
      ]);
      assert.deepEqual(
        (await pg.query("select count(*)::int as count from app_private.repository_commands")).rows,
        [{ count: 1 }],
      );
    } finally {
      await pg.close();
    }
  }

  {
    const { pg, db } = await postgresFixture();
    try {
      await activeUser(db, "owner");
      await activeUser(db, "member");
      await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
        "org",
        "owner",
        "org",
        "Organization",
        2,
      ]);
      await pg.query(
        "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','member','active',1,3)",
      );
      const store = new PostgresRepositoryCreationStore(db);
      const command: RepositoryCreateCommand = {
        requestId: "33333333-3333-4333-8333-333333333333",
        ownerAccountId: "org",
        ownerKind: "ORGANIZATION",
        name: "Shared",
        visibility: "private",
      };
      const created = await store.create("member", command, 10);
      await pg.query(
        "update app_private.organizations set member_can_create_private_repositories=false,version=version+1 where account_id='org'",
      );
      await assert.rejects(
        store.create("member", command, 11),
        (error) =>
          error instanceof RepositoryError &&
          error.status === 403 &&
          error.message === "目前 Organization capability 不允許建立 Repository。",
      );
      assert.deepEqual((await pg.query("select id,name from app_private.repositories")).rows, [
        { id: created.id, name: "Shared" },
      ]);
      assert.deepEqual(
        (await pg.query("select count(*)::int as count from app_private.repository_commands")).rows,
        [{ count: 1 }],
      );
    } finally {
      await pg.close();
    }
  }
});

test("INTERNAL creation replay survives Enterprise detachment after current owner authorization", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner");
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "org",
    "Organization",
    2,
  ]);
  await pg.query("select * from app_private.provision_enterprise_scope($1,$2,$3,$4,$5)", [
    "enterprise",
    "owner",
    "enterprise",
    "Enterprise",
    3,
  ]);
  await pg.query(
    "insert into app_private.enterprise_organizations(enterprise_account_id,organization_account_id,status,version,attached_at) values('enterprise','org','active',1,4)",
  );

  const store = new PostgresRepositoryCreationStore(db);
  const command: RepositoryCreateCommand = {
    requestId: "44444444-4444-4444-8444-444444444444",
    ownerAccountId: "org",
    ownerKind: "ORGANIZATION",
    name: "Internal",
    visibility: "internal",
  };
  const created = await store.create("owner", command, 10);
  await pg.query(
    "update app_private.enterprise_organizations set status='detached',version=version+1,detached_at=11 where enterprise_account_id='enterprise' and organization_account_id='org'",
  );

  const replay = await store.create("owner", command, 12);
  assert.equal(replay.id, created.id);
  assert.equal(replay.visibility, "internal");
  assert.deepEqual(
    (await pg.query("select count(*)::int as count from app_private.repositories")).rows,
    [{ count: 1 }],
  );
  assert.deepEqual(
    (await pg.query("select count(*)::int as count from app_private.repository_commands")).rows,
    [{ count: 1 }],
  );
});

test("duplicate Repository name rolls back the failed creation receipt", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "creator", "alice");
  const store = new PostgresRepositoryCreationStore(db);
  const command: RepositoryCreateCommand = {
    requestId: "55555555-5555-4555-8555-555555555555",
    ownerAccountId: "creator",
    ownerKind: "USER",
    name: "Alpha",
    visibility: "private",
  };
  await store.create("creator", command, 10);

  await assert.rejects(
    store.create(
      "creator",
      { ...command, requestId: "66666666-6666-4666-8666-666666666666", name: "alpha" },
      11,
    ),
    (error) =>
      error instanceof RepositoryError &&
      error.status === 409 &&
      error.message === "此 owner 已有相同或保留的 Repository 名稱。",
  );
  const evidence = await pg.query(`select
      (select count(*)::int from app_private.repositories) as repositories,
      (select count(*)::int from app_private.repository_commands) as receipts`);
  assert.deepEqual(evidence.rows, [{ repositories: 1, receipts: 1 }]);
});

test("historical Repository name returns conflict without creating a resource or receipt", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "creator", "alice");
  const store = new PostgresRepositoryCreationStore(db);
  const command: RepositoryCreateCommand = {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "creator",
    ownerKind: "USER",
    name: "Alpha",
    visibility: "private",
  };
  const created = await store.create("creator", command, 10);
  await new PostgresRepositoryManagementStore(db).execute(
    "creator",
    {
      action: "rename",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: created.id,
      expectedVersion: 1,
      name: "Beta",
    },
    11,
  );

  await assert.rejects(
    store.create(
      "creator",
      { ...command, requestId: "33333333-3333-4333-8333-333333333333", name: "alpha" },
      12,
    ),
    (error) =>
      error instanceof RepositoryError &&
      error.status === 409 &&
      error.message === "此 owner 已有相同或保留的 Repository 名稱。",
  );
  assert.deepEqual((await pg.query("select id,name,version from app_private.repositories")).rows, [
    { id: created.id, name: "Beta", version: 2 },
  ]);
  assert.deepEqual(
    (await pg.query("select count(*)::int as count from app_private.repository_commands")).rows,
    [{ count: 2 }],
  );
});

test("creation snapshots a mutable caller command before entering its transaction", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "creator", "alice");
  const command = {
    requestId: "77777777-7777-4777-8777-777777777777",
    ownerAccountId: "creator",
    ownerKind: "USER" as const,
    name: "Before",
    visibility: "private" as const,
  };
  const originalCommand = { ...command };
  const decoratedDatabase: Database = {
    transaction(work) {
      command.name = "After";
      return db.transaction(work);
    },
  };

  const created = await new PostgresRepositoryCreationStore(decoratedDatabase).create(
    "creator",
    command,
    10,
  );
  const replay = await new PostgresRepositoryCreationStore(db).create(
    "creator",
    originalCommand,
    11,
  );
  const expectedFingerprint = createHash("sha256")
    .update(JSON.stringify(originalCommand))
    .digest("hex");
  const durable = await pg.query(
    `select r.id,r.name,c.fingerprint,c.result->>'repositoryId' as receipt_repository_id
     from app_private.repositories r
     join app_private.repository_commands c on c.actor='creator' and c.request_id=$1`,
    [command.requestId],
  );

  assert.equal(command.name, "After");
  assert.deepEqual(
    {
      created: { id: created.id, name: created.name },
      replay: { id: replay.id, name: replay.name },
      durable: durable.rows,
    },
    {
      created: { id: created.id, name: "Before" },
      replay: { id: created.id, name: "Before" },
      durable: [
        {
          id: created.id,
          name: "Before",
          fingerprint: expectedFingerprint,
          receipt_repository_id: created.id,
        },
      ],
    },
  );
});
