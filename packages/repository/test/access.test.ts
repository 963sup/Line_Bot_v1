import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createRepositoryAccess } from "../src/application/access.js";
import type { RepositoryAccessStore } from "../src/contracts/repositories/access.js";
import { RepositoryError } from "../src/domain.js";
import { PostgresRepositoryAccessStore } from "../src/postgres/access-management.js";

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

  for (const [requestId, capability] of [
    ["44444444-4444-4444-8444-444444444444", "maintain"],
    ["55555555-5555-4555-8555-555555555555", "triage_plus"],
  ] as const) {
    await service.execute("subject", {
      action: "grant",
      requestId,
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "target",
      capability,
      expectedVersion: 0,
    });
  }
  assert.deepEqual(
    calls.slice(1, 3).map((call) => (call[1] as { capability?: string }).capability),
    ["maintain", "triage_plus"],
  );

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

  for (const id of ["owner", "member", "team-member", "outside"]) await activeUser(db, id);
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
  await pg.query("select * from app_private.provision_enterprise_scope($1,$2,$3,$4,$5)", [
    "enterprise",
    "owner",
    "enterprise",
    "Enterprise",
    4,
  ]);
  await pg.query(
    "insert into app_private.enterprise_organizations(enterprise_account_id,organization_account_id,status,version,attached_at) values('enterprise','org','active',1,5)",
  );
  await pg.query(
    "insert into app_private.teams(id,organization_account_id,name,slug,version,created_by_user_id,created_at) values('team-a','org','Team A','team-a',1,'owner',6)",
  );
  await pg.query(
    "insert into app_private.team_memberships(team_id,user_id,name,status,version) values('team-a','team-member','Team Member','active',1)",
  );
  const created = await pg.query(
    "select * from app_private.provision_repository($1,$2,$3,'ORGANIZATION',$4,$5)",
    ["repo", "owner", "org", "Shared", "private"],
  );
  assert.equal((created.rows[0] as { repository_id?: string } | undefined)?.repository_id, "repo");

  const store = new PostgresRepositoryAccessStore(db);
  const initial = await store.view("owner", { ownerLogin: "octo", repositoryName: "shared" });
  assert.deepEqual(initial.repository.actorPermissions, ["admin"]);
  assert.deepEqual(initial.directUserGrants, [
    { userId: "owner", capability: "admin", version: 1, isOutsideCollaborator: false },
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

  // Organization membership is affiliation, not qualification for a direct Repository grant.
  await pg.query(
    "update app_private.organization_memberships set status='removed',version=version+1 where organization_account_id='org' and user_id='member'",
  );
  const afterOrganizationRemoval = await pg.query(
    "select permissions from app_private.repository_effective_access where repository_id='repo' and user_id='member'",
  );
  assert.deepEqual(afterOrganizationRemoval.rows, [{ permissions: ["write"] }]);
  const outsideAfterRemoval = await pg.query(
    "select grant_affiliation,is_outside,grant_version from app_private.organization_repository_collaborators where repository_id='repo' and user_id='member'",
  );
  assert.deepEqual(outsideAfterRemoval.rows, [
    { grant_affiliation: "DIRECT", is_outside: true, grant_version: 2 },
  ]);

  await pg.query(
    "update app_private.organization_memberships set status='active',version=version+1 where organization_account_id='org' and user_id='member'",
  );
  const afterRejoin = await store.view("owner", { repositoryId: "repo" });
  assert.deepEqual(
    afterRejoin.directUserGrants.find((grant) => grant.userId === "member"),
    { userId: "member", capability: "write", version: 2, isOutsideCollaborator: false },
  );

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

  // A never-member active User can receive an explicit direct grant as an outside collaborator.
  const outsideGrant = await store.execute(
    "owner",
    {
      action: "grant",
      requestId: "99999999-9999-4999-8999-999999999999",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "outside",
      capability: "triage",
      expectedVersion: 0,
    },
    14,
  );
  assert.equal(outsideGrant.version, 1);
  const outsideEffective = await pg.query(
    "select permissions from app_private.repository_effective_access where repository_id='repo' and user_id='outside'",
  );
  assert.deepEqual(outsideEffective.rows, [{ permissions: ["triage"] }]);
  const organizationOutside = await pg.query(
    "select organization_account_id,repository_id,user_id,grant_affiliation,is_outside,capability,grant_version from app_private.organization_repository_collaborators where repository_id='repo' and user_id='outside'",
  );
  assert.deepEqual(organizationOutside.rows, [
    {
      organization_account_id: "org",
      repository_id: "repo",
      user_id: "outside",
      grant_affiliation: "DIRECT",
      is_outside: true,
      capability: "triage",
      grant_version: 1,
    },
  ]);
  const enterpriseOutside = await pg.query(
    "select enterprise_account_id,organization_account_id,repository_id,user_id,collaborator_affiliation,capability,grant_version from app_private.enterprise_repository_outside_collaborators where repository_id='repo' and user_id='outside'",
  );
  assert.deepEqual(enterpriseOutside.rows, [
    {
      enterprise_account_id: "enterprise",
      organization_account_id: "org",
      repository_id: "repo",
      user_id: "outside",
      collaborator_affiliation: "OUTSIDE",
      capability: "triage",
      grant_version: 1,
    },
  ]);
  const outsideView = await store.view("owner", { repositoryId: "repo" });
  assert.deepEqual(
    outsideView.directUserGrants.find((grant) => grant.userId === "outside"),
    { userId: "outside", capability: "triage", version: 1, isOutsideCollaborator: true },
  );

  await store.execute(
    "owner",
    {
      action: "revoke",
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "outside",
      expectedVersion: 1,
    },
    14,
  );
  const revokedOutside = await pg.query(
    "select user_id from app_private.repository_effective_access where repository_id='repo' and user_id='outside'",
  );
  assert.deepEqual(revokedOutside.rows, []);
  const revokedEnterpriseOutside = await pg.query(
    "select user_id from app_private.enterprise_repository_outside_collaborators where repository_id='repo' and user_id='outside'",
  );
  assert.deepEqual(revokedEnterpriseOutside.rows, []);

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
    "select permissions from app_private.repository_effective_access where repository_id='repo' and user_id='team-member'",
  );
  assert.deepEqual(teamAdmin.rows, [{ permissions: ["admin"] }]);

  await pg.query(
    "update app_private.team_memberships set status='removed' where team_id='team-a' and user_id='team-member'",
  );
  const recovery = await store.view("owner", { repositoryId: "repo" });
  assert.deepEqual(recovery.repository.actorPermissions, []);
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
  assert.equal((commands.rows[0] as { count?: number } | undefined)?.count, 8);

  await assert.rejects(
    db.transaction((sql) =>
      sql.query(
        "insert into repository_access(repository_id,principal_id,capability,version) values('repo','member','read',1)",
      ),
    ),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );
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
