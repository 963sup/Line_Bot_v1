import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
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

test("Organization viewer capabilities separate FPT ADMIN, derived MEMBER, and Owner governance", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner", "owner");
  await activeUser(db, "org-admin", "org-admin");
  await activeUser(db, "member", "member");
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
  await pg.query(
    "insert into app_private.organization_member_role_assignments(organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at) values('org','org-admin','ADMIN','active',1,1,1,4)",
  );

  const read = (userId: string) =>
    db.transaction((sql) => readOrganizationViewerCapabilities(sql, userId, "org"));
  assert.deepEqual(await read("owner"), {
    memberRole: "ADMIN",
    isOrganizationOwner: true,
    viewerIsAMember: true,
    viewerCanAdminister: true,
    viewerCanCreateRepositories: true,
    viewerCanCreateProjects: true,
    viewerCanCreateTeams: true,
    organizationVersion: 1,
    membershipVersion: 1,
    roleVersion: 1,
  });
  assert.deepEqual(await read("org-admin"), {
    memberRole: "ADMIN",
    isOrganizationOwner: false,
    viewerIsAMember: true,
    viewerCanAdminister: true,
    viewerCanCreateRepositories: true,
    viewerCanCreateProjects: true,
    viewerCanCreateTeams: true,
    organizationVersion: 1,
    membershipVersion: 1,
    roleVersion: 1,
  });
  assert.deepEqual(await read("member"), {
    memberRole: "MEMBER",
    isOrganizationOwner: false,
    viewerIsAMember: true,
    viewerCanAdminister: false,
    viewerCanCreateRepositories: false,
    viewerCanCreateProjects: false,
    viewerCanCreateTeams: true,
    organizationVersion: 1,
    membershipVersion: 1,
    roleVersion: null,
  });

  await pg.query(
    "update app_private.organization_memberships set version=version+1 where organization_account_id='org' and user_id='org-admin'",
  );
  assert.equal((await read("org-admin"))?.memberRole, "MEMBER");

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

test("FPT ADMIN can be explicitly re-granted after User qualification version changes", async (t) => {
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
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','target','active',1,3)",
  );
  await pg.query(
    "insert into app_private.organization_member_role_assignments(organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at) values('org','target','ADMIN','active',1,1,1,4)",
  );

  const governance = new PostgresOrganizationGovernance(db);
  const actor = { provider: "line:test", subject: "owner" };
  const grant = {
    action: "grant-organization-admin" as const,
    requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organizationAccountId: "org",
    targetUserId: "target",
    expectedVersion: 0,
    reason: "restore admin capability",
  };
  await db.transaction(async (sql) => {
    await sql.query("update users set status='suspended' where id='target'");
    await sql.query("update users set status='active' where id='target'");
  });
  assert.deepEqual(
    (
      await pg.query(
        "select u.status_version,r.user_status_version from app_private.users u join app_private.organization_member_role_assignments r on r.user_id=u.id where u.id='target'",
      )
    ).rows,
    [{ status_version: 3, user_status_version: 1 }],
  );
  assert.equal(
    (await db.transaction((sql) => readOrganizationViewerCapabilities(sql, "target", "org")))
      ?.memberRole,
    "MEMBER",
  );

  const regrant = await governance.execute(actor, grant, 5);
  assert.equal(regrant.status, "active");
  assert.equal(regrant.version, 2);
  assert.deepEqual(
    (
      await pg.query(
        "select status,version,user_status_version,membership_version from app_private.organization_member_role_assignments where organization_account_id='org' and user_id='target' and role='ADMIN'",
      )
    ).rows,
    [{ status: "active", version: 2, user_status_version: 3, membership_version: 1 }],
  );
});

test("stale FPT ADMIN cannot be revoked as if it were current", async (t) => {
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
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','target','active',1,3)",
  );
  await pg.query(
    "insert into app_private.organization_member_role_assignments(organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at) values('org','target','ADMIN','active',1,1,1,4)",
  );
  await db.transaction(async (sql) => {
    await sql.query("update users set status='suspended' where id='target'");
    await sql.query("update users set status='active' where id='target'");
  });

  await assert.rejects(
    new PostgresOrganizationGovernance(db).execute(
      { provider: "line:test", subject: "owner" },
      {
        action: "revoke-organization-admin",
        requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        organizationAccountId: "org",
        targetUserId: "target",
        expectedVersion: 1,
        reason: "stale revoke must fail closed",
      },
      5,
    ),
    (error: unknown) =>
      (error as { status?: number; code?: string }).status === 409 &&
      (error as { status?: number; code?: string }).code === "invalid-transition",
  );
  assert.deepEqual(
    (
      await pg.query(
        "select status,version,user_status_version from app_private.organization_member_role_assignments where organization_account_id='org' and user_id='target' and role='ADMIN'",
      )
    ).rows,
    [{ status: "active", version: 1, user_status_version: 1 }],
  );
});
