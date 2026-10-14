import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresOrganizationGovernance } from "../src/composition/bootstrap/organization-governance.js";
import { readOrganizationViewerCapabilities } from "../src/postgres/public.js";
import { PostgresOrganizationGovernance } from "../src/postgres.js";

async function activeUser(db: Database, id: string, login: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("Owner can restrict member creation and members observe the current policy", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "owner");
  await activeUser(db, "member", "member");
  await pg.query(
    "insert into user_identities(provider,subject,user_id) values('line:test','owner','owner'),('line:test','member','member')",
  );
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values ('org','member','active',1,3)",
  );
  const governance = createPostgresOrganizationGovernance(db, () => 4);
  const command = {
    action: "update-member-creation-policy",
    requestId: "12345678-1234-4234-8234-123456789abc",
    organizationAccountId: "org",
    expectedVersion: 1,
    reason: "limit member creation",
    memberCanCreatePublicRepositories: false,
    memberCanCreatePrivateRepositories: false,
    memberCanCreateInternalRepositories: false,
    memberCanCreateProjectV2: false,
    memberCanCreateTeams: false,
  };
  const receipt = await governance.execute({ provider: "line:test", subject: "owner" }, command);
  assert.equal(receipt.version, 2);
  assert.equal(
    (await governance.execute({ provider: "line:test", subject: "owner" }, command)).version,
    2,
  );
  await assert.rejects(
    governance.execute(
      { provider: "line:test", subject: "member" },
      { ...command, requestId: "23456789-1234-4234-8234-123456789abc", expectedVersion: 2 },
    ),
    (error: unknown) => error instanceof GovernanceAccessError && error.status === 403,
  );
  await assert.rejects(
    governance.execute(
      { provider: "line:test", subject: "owner" },
      { ...command, requestId: "34567890-1234-4234-8234-123456789abc" },
    ),
    (error: unknown) => error instanceof GovernanceAccessError && error.status === 409,
  );
  const detail = await governance.detail({ provider: "line:test", subject: "owner" }, "org");
  assert.equal(detail.memberCreationPolicy.memberCanCreateProjectV2, false);
  const member = await db.transaction((sql) =>
    readOrganizationViewerCapabilities(sql, "member", "org"),
  );
  assert.equal(member?.viewerCanCreateRepositories, false);
  assert.deepEqual(member?.viewerCanCreateRepositoryVisibilities, {
    public: false,
    private: false,
    internal: false,
  });
  assert.equal(member?.viewerCanCreateProjectV2, false);
  assert.equal(member?.viewerCanCreateTeams, false);
  const owner = await db.transaction((sql) =>
    readOrganizationViewerCapabilities(sql, "owner", "org"),
  );
  assert.equal(owner?.viewerCanCreateRepositories, true);
  assert.equal(owner?.viewerCanCreateProjectV2, true);
  assert.equal(owner?.viewerCanCreateTeams, true);
});

test("Organization viewer capabilities derive ADMIN only from Owner and default member creation is open", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner", "owner");
  await activeUser(db, "org-admin", "org-admin");
  await activeUser(db, "member", "member");
  await pg.query(
    "insert into user_identities(provider,subject,user_id) values('line:test','owner','owner'),('line:test','org-admin','org-admin'),('line:test','member','member')",
  );
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values ('org','org-admin','active',1,3),('org','member','active',1,3)",
  );

  const read = (userId: string) =>
    db.transaction((sql) => readOrganizationViewerCapabilities(sql, userId, "org"));
  assert.deepEqual(await read("owner"), {
    memberRole: "ADMIN",
    isOrganizationOwner: true,
    viewerIsAMember: true,
    viewerCanAdminister: true,
    viewerCanCreateRepositories: true,
    viewerCanCreateRepositoryVisibilities: { public: true, private: true, internal: true },
    viewerCanCreateProjectV2: true,
    viewerCanCreateTeams: true,
    organizationVersion: 1,
    membershipVersion: 1,
    roleVersion: 1,
  });
  assert.equal(Object.hasOwn((await read("owner")) ?? {}, "viewerCanCreateProjects"), false);
  assert.deepEqual(await read("org-admin"), {
    memberRole: "MEMBER",
    isOrganizationOwner: false,
    viewerIsAMember: true,
    viewerCanAdminister: false,
    viewerCanCreateRepositories: true,
    viewerCanCreateRepositoryVisibilities: { public: true, private: true, internal: true },
    viewerCanCreateProjectV2: true,
    viewerCanCreateTeams: true,
    organizationVersion: 1,
    membershipVersion: 1,
    roleVersion: null,
  });
  assert.deepEqual(await read("member"), {
    memberRole: "MEMBER",
    isOrganizationOwner: false,
    viewerIsAMember: true,
    viewerCanAdminister: false,
    viewerCanCreateRepositories: true,
    viewerCanCreateRepositoryVisibilities: { public: true, private: true, internal: true },
    viewerCanCreateProjectV2: true,
    viewerCanCreateTeams: true,
    organizationVersion: 1,
    membershipVersion: 1,
    roleVersion: null,
  });

  const governance = new PostgresOrganizationGovernance(db);
  for (const [subject, canCreate] of [
    ["owner", true],
    ["org-admin", true],
    ["member", true],
  ] as const) {
    const list = await governance.list({ provider: "line:test", subject }, {});
    assert.equal(list.items[0]?.actorCanCreateProjectV2, canCreate);
  }

  await pg.query(
    "update app_private.organization_memberships set version=version+1 where organization_account_id='org' and user_id='org-admin'",
  );
  assert.equal((await read("org-admin"))?.memberRole, "MEMBER");
  assert.equal(
    (await governance.list({ provider: "line:test", subject: "org-admin" }, {})).items[0]
      ?.actorCanCreateProjectV2,
    true,
  );

  await pg.query("update app_private.organizations set status='inactive' where account_id='org'");
  assert.equal(await read("owner"), null);
  assert.equal(await read("member"), null);
});

test("pending Organization invitation has no FPT member role projection", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner", "owner");
  await activeUser(db, "pending", "pending");
  await pg.query(
    "insert into user_identities(provider,subject,user_id) values('line:test','pending','pending')",
  );
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_invitations(organization_account_id,user_id,status,version,created_at) values('org','pending','pending',1,3)",
  );

  const list = await new PostgresOrganizationGovernance(db).list(
    { provider: "line:test", subject: "pending" },
    {},
  );
  assert.equal(list.items[0]?.actorInvitationStatus, "pending");
  assert.equal(list.items[0]?.actorMemberRole, null);
  assert.equal(list.items[0]?.actorCanCreateProjectV2, false);
});

test("OrganizationOwner can be explicitly re-granted after membership epoch removal", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner", "owner");
  await activeUser(db, "target", "target");
  await pg.query(
    "insert into user_identities(provider,subject,user_id) values('line:test','owner','owner')",
  );
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_direct_memberships(organization_account_id,user_id,status,version,created_at) values('org','target','active',1,3)",
  );
  await pg.query("select * from app_private.refresh_organization_membership($1,$2,$3)", [
    "org",
    "target",
    3,
  ]);

  const governance = new PostgresOrganizationGovernance(db);
  const actor = { provider: "line:test", subject: "owner" };
  const grant = {
    action: "grant-organization-owner" as const,
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organizationAccountId: "org",
    targetUserId: "target",
    expectedVersion: 0,
    reason: "initial owner grant",
  };
  assert.equal((await governance.execute(actor, grant, 4)).status, "active");

  await pg.query(
    "update app_private.organization_direct_memberships set status='removed',version=version+1 where organization_account_id='org' and user_id='target'",
  );
  await pg.query("select * from app_private.refresh_organization_membership($1,$2,$3)", [
    "org",
    "target",
    5,
  ]);
  await pg.query(
    "update app_private.organization_direct_memberships set status='active',version=version+1 where organization_account_id='org' and user_id='target'",
  );
  await pg.query("select * from app_private.refresh_organization_membership($1,$2,$3)", [
    "org",
    "target",
    6,
  ]);
  assert.equal(
    (await db.transaction((sql) => readOrganizationViewerCapabilities(sql, "target", "org")))
      ?.memberRole,
    "MEMBER",
  );

  const regrant = await governance.execute(
    actor,
    { ...grant, requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", expectedVersion: 0 },
    7,
  );
  assert.equal(regrant.status, "active");
  assert.equal(regrant.version, 2);
  assert.deepEqual(
    (
      await pg.query(
        "select status,version,membership_version from app_private.organization_role_assignments where organization_account_id='org' and user_id='target' and role='OrganizationOwner'",
      )
    ).rows,
    [{ status: "active", version: 2, membership_version: 3 }],
  );
});
