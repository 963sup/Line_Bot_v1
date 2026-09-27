import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresRepositoryCreationStore } from "../src/adapters/postgres/creation.js";
import { createRepositoryCreation } from "../src/application/creation.js";
import type { RepositoryCreationStore } from "../src/application/ports/creation.js";
import { RepositoryError } from "../src/domain.js";

test("Repository create application canonicalizes input before the store", async () => {
  const calls: unknown[][] = [];
  const store = {
    owners: async () => [],
    create: async (...args: unknown[]) => {
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
  } as RepositoryCreationStore;
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
  assert.equal((calls[0]?.[1] as { name: string }).name, "Repo");
  assert.equal(calls[0]?.[2], 10);

  await assert.rejects(
    service.create("subject", {
      requestId: "11111111-1111-4111-8111-111111111111",
      ownerAccountId: "user",
      ownerKind: "USER",
      name: "Repo",
      visibility: "public",
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

async function activeUser(
  pg: { query(sql: string, values?: unknown[]): Promise<unknown> },
  id: string,
  login: string,
) {
  await pg.query(
    "insert into app_private.users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
    [id],
  );
  await pg.query("select app_private.set_account_login($1,'USER',$2,1)", [id, login]);
}

test("Repository creation lists only effective owner scopes and preserves exact replay", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(pg, "creator", "alice");
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
    { id: "creator", kind: "USER", login: "alice" },
    { id: "org-active", kind: "ORGANIZATION", login: "acme" },
  ]);

  const command = {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerAccountId: "creator",
    ownerKind: "USER" as const,
    name: "Alpha",
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
    "select capability from app_private.repository_effective_access where repository_id=$1 and user_id='creator'",
    [created.id],
  );
  assert.deepEqual(access.rows, [{ capability: "admin" }]);

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

test("Organization Repository creation requires current OrganizationOwner and bootstraps creator admin atomically", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(pg, "owner", "owner");
  await activeUser(pg, "member", "member");
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

  const store = new PostgresRepositoryCreationStore(db);
  const command = {
    requestId: "33333333-3333-4333-8333-333333333333",
    ownerAccountId: "org",
    ownerKind: "ORGANIZATION" as const,
    name: "Shared",
  };
  const created = await store.create("owner", command, 10);
  const grant = await pg.query(
    "select capability,version from app_private.repository_access where repository_id=$1 and principal_id='owner'",
    [created.id],
  );
  assert.deepEqual(grant.rows, [{ capability: "admin", version: 1 }]);

  await assert.rejects(
    store.create(
      "member",
      { ...command, requestId: "44444444-4444-4444-8444-444444444444", name: "Denied" },
      11,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
  await assert.rejects(
    pg.query("select * from app_private.provision_repository($1,$2,$3,'ORGANIZATION',$4)", [
      "direct-denied",
      "member",
      "org",
      "Direct Denied",
    ]),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );

  await pg.query(
    "update app_private.organization_role_assignments set status='revoked',version=version+1 where organization_account_id='org' and user_id='owner' and role='OrganizationOwner'",
  );
  await assert.rejects(
    store.create("owner", command, 12),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
});
