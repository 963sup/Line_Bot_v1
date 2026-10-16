import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { isOrganizationOwner } from "@line_bot_v1/identity-access/postgres";
import { createPostgresOrganizationGovernance } from "@line_bot_v1/organization/composition/bootstrap/organization-governance";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";

const actor = { provider: "line:test", subject: "owner" };
function evidence(sequence: number) {
  return {
    requestId: `99999999-9999-4999-8999-${String(sequence).padStart(12, "0")}`,
    reason: "team source consistency",
  };
}

async function ownerSourceFixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('member1','active',1),('member2','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES ('line:test','owner','owner'),('line:test','member1','member1'),('line:test','member2','member2');
    SELECT * FROM app_private.provision_enterprise_scope('ent','owner','ent','Enterprise',2);
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    INSERT INTO app_private.enterprise_direct_affiliations(enterprise_account_id,user_id,status,version,created_at) VALUES ('ent','member1','active',1,2),('ent','member2','active',1,2);
    INSERT INTO app_private.enterprise_organizations(enterprise_account_id,organization_account_id,status,version,attached_at) VALUES ('ent','org','active',1,2);
    SELECT * FROM app_private.claim_scoped_namespace_name('enterprise-team-slug','ENTERPRISE','ent','ENTERPRISE_TEAM','platform-team','platform',2);
    INSERT INTO app_private.enterprise_teams(id,enterprise_account_id,name,slug,version,created_by_user_id,created_at) VALUES ('platform-team','ent','Platform','platform',1,'owner',2);
    INSERT INTO app_private.enterprise_team_memberships(team_id,enterprise_account_id,user_id,status,version,joined_at) VALUES ('platform-team','ent','member1','active',1,2),('platform-team','ent','member2','active',1,2);
    INSERT INTO app_private.enterprise_team_organizations(team_id,enterprise_account_id,organization_account_id,status,version,assigned_at,detached_at) VALUES ('platform-team','ent','org','active',1,2,null);
    INSERT INTO app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) VALUES ('org','member1','active',1,2),('org','member2','active',1,2);
    COMMIT;
  `);
  const governance = createPostgresEnterpriseGovernance(f.db, () => 100);
  const organization = createPostgresOrganizationGovernance(f.db, () => 100);
  const teamId = "platform-team";
  for (const [index, userId] of ["member1", "member2"].entries())
    await organization.execute(actor, {
      ...evidence(6 + index),
      action: "grant-organization-owner",
      organizationAccountId: "org",
      targetUserId: userId,
      expectedVersion: 0,
    });
  await organization.execute(actor, {
    ...evidence(8),
    action: "revoke-organization-owner",
    organizationAccountId: "org",
    targetUserId: "owner",
    expectedVersion: 1,
  });
  return { ...f, governance, organization, teamId };
}

test("detaching one Team source cannot remove all current Organization Owners in the same batch", async (t) => {
  const { pg, db, governance, teamId } = await ownerSourceFixture();
  t.after(() => pg.close());
  const qualified = () =>
    db.transaction(
      async (sql) =>
        Number(await isOrganizationOwner(sql, "org", "member1")) +
        Number(await isOrganizationOwner(sql, "org", "member2")),
    );
  assert.equal(await qualified(), 2);
  const rejected = await governance
    .execute(actor, {
      ...evidence(9),
      action: "detach-enterprise-team-organization",
      enterpriseAccountId: "ent",
      teamId,
      organizationAccountId: "org",
      expectedVersion: 1,
    })
    .then(
      () => false,
      (error: unknown) => {
        assert.ok(error instanceof GovernanceAccessError);
        assert.equal(error.code, "last-effective-role-holder");
        return true;
      },
    );
  assert.equal(
    await qualified(),
    2,
    "a batch must not count another Owner who loses the same membership source as its replacement",
  );
  assert.equal(rejected, true);
  assert.deepEqual(
    (await pg.query("SELECT status,version FROM app_private.enterprise_team_organizations")).rows,
    [{ status: "active", version: 1 }],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    3,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    3,
  );
});

test("batch source removal keeps an affected Owner who has an independent direct source", async (t) => {
  const { pg, db, governance, teamId } = await ownerSourceFixture();
  t.after(() => pg.close());
  await pg.exec(
    "INSERT INTO app_private.organization_direct_memberships(organization_account_id,user_id,status,version,created_at) VALUES ('org','member2','active',1,2)",
  );
  assert.equal(
    (
      await governance.execute(actor, {
        ...evidence(9),
        action: "detach-enterprise-team-organization",
        enterpriseAccountId: "ent",
        teamId,
        organizationAccountId: "org",
        expectedVersion: 1,
      })
    ).status,
    "detached",
  );
  assert.deepEqual(
    await db.transaction(async (sql) => [
      await isOrganizationOwner(sql, "org", "member1"),
      await isOrganizationOwner(sql, "org", "member2"),
    ]),
    [false, true],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member2'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
  );
});

test("single member removal still counts the other unaffected Team Owner", async (t) => {
  const { pg, db, governance, teamId } = await ownerSourceFixture();
  t.after(() => pg.close());
  assert.equal(
    (
      await governance.execute(actor, {
        ...evidence(9),
        action: "remove-enterprise-team-member",
        enterpriseAccountId: "ent",
        teamId,
        targetUserId: "member1",
        expectedVersion: 1,
      })
    ).status,
    "removed",
  );
  assert.deepEqual(
    await db.transaction(async (sql) => [
      await isOrganizationOwner(sql, "org", "member1"),
      await isOrganizationOwner(sql, "org", "member2"),
    ]),
    [false, true],
  );
  assert.deepEqual(
    (await pg.query("SELECT status,version FROM app_private.enterprise_team_organizations")).rows,
    [{ status: "active", version: 1 }],
  );
});

test("an independent source does not make a stale Owner epoch a replacement", async (t) => {
  const { pg, db, governance, teamId } = await ownerSourceFixture();
  t.after(() => pg.close());
  await pg.exec(
    "INSERT INTO app_private.organization_direct_memberships(organization_account_id,user_id,status,version,created_at) VALUES ('org','member2','active',1,2); UPDATE app_private.users SET status='paused' WHERE id='member2'; UPDATE app_private.users SET status='active' WHERE id='member2'",
  );
  await assert.rejects(
    governance.execute(actor, {
      ...evidence(9),
      action: "detach-enterprise-team-organization",
      enterpriseAccountId: "ent",
      teamId,
      organizationAccountId: "org",
      expectedVersion: 1,
    }),
    (error: unknown) =>
      error instanceof GovernanceAccessError && error.code === "last-effective-role-holder",
  );
  assert.deepEqual(
    await db.transaction(async (sql) => [
      await isOrganizationOwner(sql, "org", "member1"),
      await isOrganizationOwner(sql, "org", "member2"),
    ]),
    [true, false],
  );
});

test("batch source removal counts a current Owner outside the affected Team", async (t) => {
  const { pg, db, governance, organization, teamId } = await ownerSourceFixture();
  t.after(() => pg.close());
  await organization.execute(
    { provider: "line:test", subject: "member1" },
    {
      ...evidence(9),
      action: "grant-organization-owner",
      organizationAccountId: "org",
      targetUserId: "owner",
      expectedVersion: 0,
    },
  );
  assert.equal(
    (
      await governance.execute(actor, {
        ...evidence(10),
        action: "detach-enterprise-team-organization",
        enterpriseAccountId: "ent",
        teamId,
        organizationAccountId: "org",
        expectedVersion: 1,
      })
    ).status,
    "detached",
  );
  assert.deepEqual(
    await db.transaction(async (sql) => [
      await isOrganizationOwner(sql, "org", "owner"),
      await isOrganizationOwner(sql, "org", "member1"),
      await isOrganizationOwner(sql, "org", "member2"),
    ]),
    [true, false, false],
  );
});
