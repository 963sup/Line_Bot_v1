import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryAccessStore } from "../src/adapters/postgres/access-management.js";
import { createRepositoryAccess } from "../src/application/access.js";
import type { RepositoryAccessStore } from "../src/application/ports/access.js";
import { RepositoryError } from "../src/domain.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("Repository access application validates commands before persistence", async () => {
  const calls: unknown[][] = [];
  const store = {
    view: async () => {
      throw new Error("not used");
    },
    execute: async (...args: unknown[]) => {
      calls.push(args);
      return {
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "target",
        capability: "read",
        version: 1,
        at: 10,
      } as const;
    },
  } as RepositoryAccessStore;
  const service = createRepositoryAccess({
    activeUser: async () => ({ id: "actor" }),
    store: () => store,
    now: () => 10,
  });

  await service.execute("subject", {
    action: "grant",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    subjectKind: "USER",
    subjectId: "target",
    capability: "read",
    expectedVersion: 0,
  });
  assert.equal(calls[0]?.[0], "actor");
  assert.equal(calls[0]?.[2], 10);

  await assert.rejects(
    service.execute("subject", {
      action: "revoke",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "target",
      capability: "read",
      expectedVersion: 1,
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

test("Repository access management supports direct and Team grants with replay, version and admin recovery", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const id of ["owner", "member", "team-member"]) await activeUser(db, id);
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "octo",
    "Octo",
    2,
  ]);
  for (const id of ["member", "team-member"]) {
    await pg.query(
      "insert into app_private.organization_direct_memberships(organization_account_id,user_id,status,version,created_at) values('org',$1,'active',1,3)",
      [id],
    );
    await pg.query(
      "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org',$1,'active',1,3)",
      [id],
    );
  }
  await pg.query(
    "insert into app_private.teams(id,organization_account_id,name,slug,version,created_by_user_id,created_at) values('team-a','org','Team A','team-a',1,'owner',4)",
  );
  await pg.query(
    "insert into app_private.team_memberships(team_id,user_id,name,status,version) values('team-a','team-member','Team Member','active',1)",
  );
  const created = await pg.query(
    "select * from app_private.provision_repository($1,$2,$3,'ORGANIZATION',$4)",
    ["repo", "owner", "org", "Shared"],
  );
  assert.equal(created.rows[0]?.repository_id, "repo");

  const store = new PostgresRepositoryAccessStore(db);
  const initial = await store.view("owner", { ownerLogin: "octo", repositoryName: "shared" });
  assert.equal(initial.repository.actorCapability, "admin");
  assert.deepEqual(initial.directUserGrants, [
    { userId: "owner", capability: "admin", version: 1 },
  ]);

  const userGrant = {
    action: "grant" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    subjectKind: "USER" as const,
    subjectId: "member",
    capability: "read" as const,
    expectedVersion: 0,
  };
  assert.equal((await store.execute("owner", userGrant, 10)).version, 1);
  assert.equal((await store.execute("owner", userGrant, 11)).version, 1);
  await assert.rejects(
    store.execute("owner", { ...userGrant, capability: "write" }, 12),
    (error) => error instanceof RepositoryError && error.status === 409,
  );

  const updated = await store.execute(
    "owner",
    {
      ...userGrant,
      requestId: "22222222-2222-4222-8222-222222222222",
      capability: "write",
      expectedVersion: 1,
    },
    13,
  );
  assert.equal(updated.version, 2);
  await store.execute(
    "owner",
    {
      action: "revoke",
      requestId: "33333333-3333-4333-8333-333333333333",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "member",
      expectedVersion: 2,
    },
    14,
  );

  await store.execute(
    "owner",
    {
      action: "grant",
      requestId: "44444444-4444-4444-8444-444444444444",
      repositoryId: "repo",
      subjectKind: "TEAM",
      subjectId: "team-a",
      capability: "admin",
      expectedVersion: 0,
    },
    15,
  );
  await store.execute(
    "owner",
    {
      action: "revoke",
      requestId: "55555555-5555-4555-8555-555555555555",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "owner",
      expectedVersion: 1,
    },
    16,
  );
  const teamAdmin = await pg.query(
    "select capability from app_private.repository_effective_access where repository_id='repo' and user_id='team-member'",
  );
  assert.deepEqual(teamAdmin.rows, [{ capability: "admin" }]);

  await pg.query(
    "update app_private.team_memberships set status='removed' where team_id='team-a' and user_id='team-member'",
  );
  const recovery = await store.view("owner", { repositoryId: "repo" });
  assert.equal(recovery.repository.actorCapability, null);
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "revoke",
        requestId: "66666666-6666-4666-8666-666666666666",
        repositoryId: "repo",
        subjectKind: "TEAM",
        subjectId: "team-a",
        expectedVersion: 1,
      },
      17,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  const recovered = await store.execute(
    "owner",
    {
      action: "grant",
      requestId: "77777777-7777-4777-8777-777777777777",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "owner",
      capability: "admin",
      expectedVersion: 0,
    },
    18,
  );
  assert.equal(recovered.version, 1);

  const commands = await pg.query(
    "select count(*)::int as count from app_private.repository_commands where actor='owner'",
  );
  assert.equal(commands.rows[0]?.count, 5);
});

test("User-owned Repository keeps owner implicit admin and rejects redundant owner grants", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "alice");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo-user','owner','USER','Personal','private',1)",
  );
  const store = new PostgresRepositoryAccessStore(db);
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "grant",
        requestId: "88888888-8888-4888-8888-888888888888",
        repositoryId: "repo-user",
        subjectKind: "USER",
        subjectId: "owner",
        capability: "read",
        expectedVersion: 0,
      },
      10,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
});
