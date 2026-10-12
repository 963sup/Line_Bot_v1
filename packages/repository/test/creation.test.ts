import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createRepositoryCreation } from "../src/application/creation.js";
import type { RepositoryCreationStore } from "../src/contracts/repositories/creation.js";
import { RepositoryError } from "../src/domain.js";
import { PostgresRepositoryCreationStore } from "../src/postgres/creation.js";

test("Repository create application canonicalizes input before the store", async () => {
  const calls: Parameters<RepositoryCreationStore["create"]>[] = [];
  const store: RepositoryCreationStore = {
    owners: async () => [],
    create: async (...args) => {
      calls.push(args);
      return {
        id: "repo",
        ownerAccountId: "user",
        ownerKind: "USER",
        ownerLogin: "alice",
        name: "Repo",
        visibility: "private",
        version: 1,
      } as const;
    },
  };
  const service = createRepositoryCreation({
    activeUser: async () => ({ id: "user" }),
    store: () => store,
    now: () => 10,
  });

  await service.create("subject", {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "user",
    ownerKind: "USER",
    name: "  Repo  ",
  });
  assert.deepEqual(calls[0]?.[1], {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "user",
    ownerKind: "USER",
    name: "Repo",
    visibility: "private",
  });
  assert.equal(calls[0]?.[2], 10);

  await service.create("subject", {
    requestId: "22222222-2222-4222-8222-222222222222",
    ownerAccountId: "user",
    ownerKind: "USER",
    name: "Public",
    visibility: "public",
  });
  assert.equal(calls[1]?.[1].visibility, "public");

  await assert.rejects(
    service.create("subject", {
      requestId: "33333333-3333-4333-8333-333333333333",
      ownerAccountId: "user",
      ownerKind: "USER",
      name: "Repo",
      visibility: "hidden",
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

async function activeUser(db: Database, id: string, login: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("Repository provisioning uses the shared governance lock held by its caller", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const result = await pg.query(
    "select pg_get_functiondef('app_private.provision_repository(text,text,text,text,text,text)'::regprocedure) as definition",
  );
  const definition = String((result.rows[0] as { definition: string } | undefined)?.definition);

  assert.match(definition, /pg_advisory_xact_lock_shared\(71020260912::bigint\)/);
  assert.doesNotMatch(definition, /pg_advisory_xact_lock\(71020260912::bigint\)/);
});

test("Repository creation lists only effective owner scopes and preserves exact replay", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "creator", "alice");
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org-active",
    "creator",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org-inactive",
    "creator",
    "old-acme",
    "Old Acme",
    3,
  ]);
  await pg.query(
    "update app_private.organizations set status='inactive' where account_id='org-inactive'",
  );

  const store = new PostgresRepositoryCreationStore(db);
  assert.deepEqual(await store.owners("creator"), [
    {
      id: "creator",
      kind: "USER",
      login: "alice",
      internalEligible: false,
      creatableVisibilities: ["private", "public"],
    },
    {
      id: "org-active",
      kind: "ORGANIZATION",
      login: "acme",
      internalEligible: false,
      creatableVisibilities: ["private", "public"],
    },
  ]);

  const command = {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "creator",
    ownerKind: "USER" as const,
    name: "Alpha",
    visibility: "private" as const,
  };
  const created = await store.create("creator", command, 10);
  const replay = await store.create("creator", command, 11);
  assert.equal(replay.id, created.id);

  const count = await pg.query(
    "select count(*)::int as count from app_private.repositories where owner_account_id='creator' and lower(name)='alpha'",
  );
  assert.deepEqual(count.rows, [{ count: 1 }]);
  const receipts = await pg.query(
    "select count(*)::int as count from app_private.repository_commands where actor='creator'",
  );
  assert.deepEqual(receipts.rows, [{ count: 1 }]);
  const access = await pg.query(
    "select permissions from app_private.repository_effective_access where repository_id=$1 and user_id='creator'",
    [created.id],
  );
  assert.deepEqual(access.rows, [{ permissions: ["admin"] }]);

  await assert.rejects(
    store.create("creator", { ...command, name: "Different" }, 12),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  await assert.rejects(
    store.create(
      "creator",
      { ...command, requestId: "22222222-2222-4222-8222-222222222222", name: "alpha" },
      13,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
});

test("Organization Repository creation follows viewerCanCreateRepositories and bootstraps creator admin atomically", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "owner");
  await activeUser(db, "org-admin", "org-admin");
  await activeUser(db, "member", "member");
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "octo",
    "Octo",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','member','active',1,3)",
  );
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','org-admin','active',1,3)",
  );

  const store = new PostgresRepositoryCreationStore(db);
  const command = {
    requestId: "33333333-3333-4333-8333-333333333333",
    ownerAccountId: "org",
    ownerKind: "ORGANIZATION" as const,
    name: "Shared",
    visibility: "private" as const,
  };
  const created = await store.create("owner", command, 10);
  const grant = await pg.query(
    "select capability,version from app_private.repository_access where repository_id=$1 and principal_id='owner'",
    [created.id],
  );
  assert.deepEqual(grant.rows, [{ capability: "admin", version: 1 }]);

  const adminCreated = await store.create(
    "org-admin",
    { ...command, requestId: "55555555-5555-4555-8555-555555555555", name: "Admin Shared" },
    11,
  );
  assert.equal(adminCreated.ownerAccountId, "org");

  const memberCreated = await store.create(
    "member",
    { ...command, requestId: "44444444-4444-4444-8444-444444444444", name: "Member Shared" },
    12,
  );
  assert.equal(memberCreated.ownerAccountId, "org");
  await pg.query(
    "update app_private.organizations set member_can_create_private_repositories=false,version=version+1 where account_id='org'",
  );
  assert.deepEqual(
    (await store.owners("member")).find((option) => option.id === "org")?.creatableVisibilities,
    ["public"],
  );
  const publicCreated = await store.create(
    "member",
    {
      ...command,
      requestId: "88888888-8888-4888-8888-888888888888",
      name: "Public Shared",
      visibility: "public",
    },
    12,
  );
  assert.equal(publicCreated.visibility, "public");
  await assert.rejects(
    store.create(
      "org-admin",
      { ...command, requestId: "66666666-6666-4666-8666-666666666666", name: "Restricted" },
      12,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
  await assert.rejects(
    pg.query("select * from app_private.provision_repository($1,$2,$3,'ORGANIZATION',$4,$5)", [
      "direct-denied",
      "member",
      "org",
      "Direct Denied",
      "private",
    ]),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );

  await pg.query(
    "update app_private.organization_role_assignments set status='revoked',version=version+1 where organization_account_id='org' and user_id='owner' and role='OrganizationOwner'",
  );
  await assert.rejects(
    store.create(
      "owner",
      { ...command, requestId: "77777777-7777-4777-8777-777777777777", name: "Former Owner" },
      13,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
});
