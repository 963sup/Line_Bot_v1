import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createPostgresOrganizationGovernance } from "@line_bot_v1/organization/composition/bootstrap/organization-governance";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";

const actor = { provider: "line:test", subject: "owner" };
function failure(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}

async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('member','active',1),('paused','paused',1),('outsider','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES ('line:test','owner','owner'),('line:test','member','member');
    SELECT * FROM app_private.provision_enterprise_scope('ent','owner','ent','Enterprise',2);
    SELECT * FROM app_private.provision_enterprise_scope('other-ent','owner','other-ent','Other Enterprise',2);
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    SELECT * FROM app_private.provision_organization_scope('other-org','owner','other-org','Other Org',2);
    INSERT INTO app_private.enterprise_direct_affiliations(enterprise_account_id,user_id,status,version,created_at) VALUES ('ent','member','active',1,2),('ent','paused','active',1,2);
    INSERT INTO app_private.enterprise_organizations(enterprise_account_id,organization_account_id,status,version,attached_at) VALUES ('ent','org','active',1,2),('other-ent','other-org','active',1,2);
    COMMIT;
  `);
  let sequence = 0;
  const evidence = () => ({
    requestId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}`,
    reason: "team characterization",
  });
  const governance = createPostgresEnterpriseGovernance(f.db, () => 100);
  const organization = createPostgresOrganizationGovernance(f.db, () => 100);
  const command = (action: string, fields: Record<string, unknown> = {}) => ({
    ...evidence(),
    action,
    enterpriseAccountId: "ent",
    ...fields,
  });
  const create = () =>
    governance.execute(actor, command("create-enterprise-team", { name: "Platform" }));
  const invite = () =>
    organization.execute(actor, {
      ...evidence(),
      action: "invite-member",
      organizationAccountId: "org",
      targetUserId: "member",
      expectedVersion: 0,
    });
  return { ...f, governance, command, create, invite };
}

test("Enterprise Team create and rename preserve stable identity, slug uniqueness, versions and exact replay", async (t) => {
  const { pg, governance, command } = await fixture();
  t.after(() => pg.close());
  const input = command("create-enterprise-team", { name: "Platform" });
  const created = await governance.execute(actor, input);
  assert.equal(created.subjectKind, "enterprise-team");
  assert.equal(created.version, 1);
  assert.equal(created.status, "created");
  const teamId = created.subjectId;
  assert.ok(teamId);
  assert.deepEqual(await governance.execute(actor, input), created);
  await assert.rejects(
    governance.execute(actor, { ...input, reason: "changed" }),
    failure(409, "replay-conflict"),
  );
  await assert.rejects(
    governance.execute(actor, command("create-enterprise-team", { name: "PLATFORM" })),
    failure(409, "conflict"),
  );
  const rename = command("rename-enterprise-team", {
    teamId,
    name: "Research",
    expectedVersion: 1,
  });
  assert.equal((await governance.execute(actor, rename)).version, 2);
  await assert.rejects(
    governance.execute(
      actor,
      command("rename-enterprise-team", { teamId, name: "New", expectedVersion: 1 }),
    ),
    failure(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(
      actor,
      command("rename-enterprise-team", { teamId, name: "Research", expectedVersion: 2 }),
    ),
    failure(409, "invalid-transition"),
  );
  assert.deepEqual(
    (await pg.query("SELECT id,name,slug,version FROM app_private.enterprise_teams")).rows,
    [{ id: teamId, name: "Research", slug: "research", version: 2 }],
  );
  assert.deepEqual(await governance.execute(actor, input), created);
  assert.deepEqual(await governance.execute(actor, rename), {
    ...created,
    requestId: rename.requestId,
    action: "rename-enterprise-team",
    status: "renamed",
    version: 2,
  });
});

test("Enterprise Team member and Organization assignment lifecycles preserve independent sources and membership epochs", async (t) => {
  const { pg, governance, command, create, invite } = await fixture();
  t.after(() => pg.close());
  const teamId = (await create()).subjectId;
  assert.ok(teamId);
  const member = { teamId, targetUserId: "member" };
  const scope = { teamId, organizationAccountId: "org" };
  assert.equal(
    (
      await governance.execute(
        actor,
        command("add-enterprise-team-member", { ...member, expectedVersion: 0 }),
      )
    ).version,
    1,
  );
  await invite();
  assert.equal(
    (
      await governance.execute(
        actor,
        command("assign-enterprise-team-organization", { ...scope, expectedVersion: 0 }),
      )
    ).subjectKind,
    "enterprise-team",
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_invitations WHERE user_id='member'",
      )
    ).rows,
    [{ status: "cancelled", version: 2 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
  );
  assert.equal(
    (
      await governance.execute(
        actor,
        command("remove-enterprise-team-member", { ...member, expectedVersion: 1 }),
      )
    ).version,
    2,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member'",
      )
    ).rows,
    [{ status: "removed", version: 2 }],
  );
  assert.equal(
    (
      await governance.execute(
        actor,
        command("add-enterprise-team-member", { ...member, expectedVersion: 2 }),
      )
    ).version,
    3,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member'",
      )
    ).rows,
    [{ status: "active", version: 3 }],
  );
  assert.equal(
    (
      await governance.execute(
        actor,
        command("detach-enterprise-team-organization", { ...scope, expectedVersion: 1 }),
      )
    ).version,
    2,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member'",
      )
    ).rows,
    [{ status: "removed", version: 4 }],
  );
  assert.equal(
    (
      await governance.execute(
        actor,
        command("assign-enterprise-team-organization", { ...scope, expectedVersion: 2 }),
      )
    ).version,
    3,
  );
  await pg.exec(
    "INSERT INTO app_private.organization_direct_memberships(organization_account_id,user_id,status,version,created_at) VALUES('org','member','active',1,100)",
  );
  assert.equal(
    (
      await governance.execute(
        actor,
        command("detach-enterprise-team-organization", { ...scope, expectedVersion: 3 }),
      )
    ).version,
    4,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member'",
      )
    ).rows,
    [{ status: "active", version: 5 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT * FROM app_private.organization_role_assignments WHERE user_id='member'",
      )
    ).rows,
    [],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    9,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    9,
  );
});

test("Enterprise Team rejects cross-scope, inactive qualification and non-affiliation before mutation and requires current Owner before replay", async (t) => {
  const { pg, governance, command, create } = await fixture();
  t.after(() => pg.close());
  const created = await create();
  const teamId = created.subjectId;
  await assert.rejects(
    governance.execute(
      actor,
      command("add-enterprise-team-member", {
        teamId,
        targetUserId: "outsider",
        expectedVersion: 9,
      }),
    ),
    failure(403, "forbidden"),
  );
  await assert.rejects(
    governance.execute(
      actor,
      command("add-enterprise-team-member", { teamId, targetUserId: "paused", expectedVersion: 0 }),
    ),
    failure(404, "not-found"),
  );
  await assert.rejects(
    governance.execute(
      actor,
      command("assign-enterprise-team-organization", {
        teamId,
        organizationAccountId: "other-org",
        expectedVersion: 0,
      }),
    ),
    failure(409, "scope-conflict"),
  );
  await assert.rejects(
    governance.execute(
      actor,
      command("rename-enterprise-team", {
        enterpriseAccountId: "other-ent",
        teamId,
        name: "Wrong",
        expectedVersion: 1,
      }),
    ),
    failure(404, "not-found"),
  );
  await pg.exec("UPDATE app_private.organizations SET status='inactive' WHERE account_id='org'");
  await assert.rejects(
    governance.execute(
      actor,
      command("assign-enterprise-team-organization", {
        teamId,
        organizationAccountId: "org",
        expectedVersion: 0,
      }),
    ),
    failure(409, "scope-conflict"),
  );
  const rename = command("rename-enterprise-team", { teamId, name: "Renamed", expectedVersion: 1 });
  await governance.execute(actor, rename);
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='owner'; UPDATE app_private.users SET status='active' WHERE id='owner'",
  );
  await assert.rejects(governance.execute(actor, rename), failure(403, "forbidden"));
  assert.deepEqual((await pg.query("SELECT name,version FROM app_private.enterprise_teams")).rows, [
    { name: "Renamed", version: 2 },
  ]);
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    2,
  );
});

test("Enterprise Team assignment and detachment roll back memberships, invitations and all evidence on audit failure", async (t) => {
  const { pg, governance, command, create, invite } = await fixture();
  t.after(() => pg.close());
  const teamId = (await create()).subjectId;
  await governance.execute(
    actor,
    command("add-enterprise-team-member", { teamId, targetUserId: "member", expectedVersion: 0 }),
  );
  await invite();
  const installFailure = () =>
    pg.exec(`CREATE OR REPLACE FUNCTION app_private.fail_team_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'team-audit-unavailable'; END $$;
    CREATE TRIGGER fail_team_audit BEFORE INSERT ON app_private.governance_audit_events FOR EACH ROW EXECUTE FUNCTION app_private.fail_team_audit()`);
  await installFailure();
  const assign = command("assign-enterprise-team-organization", {
    teamId,
    organizationAccountId: "org",
    expectedVersion: 0,
  });
  await assert.rejects(governance.execute(actor, assign), /team-audit-unavailable/);
  assert.deepEqual(
    (await pg.query("SELECT * FROM app_private.enterprise_team_organizations")).rows,
    [],
  );
  assert.deepEqual(
    (await pg.query("SELECT * FROM app_private.organization_memberships WHERE user_id='member'"))
      .rows,
    [],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_invitations WHERE user_id='member'",
      )
    ).rows,
    [{ status: "pending", version: 1 }],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    3,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    3,
  );
  await pg.exec("DROP TRIGGER fail_team_audit ON app_private.governance_audit_events");
  await governance.execute(actor, assign);
  await installFailure();
  await assert.rejects(
    governance.execute(
      actor,
      command("detach-enterprise-team-organization", {
        teamId,
        organizationAccountId: "org",
        expectedVersion: 1,
      }),
    ),
    /team-audit-unavailable/,
  );
  assert.deepEqual(
    (await pg.query("SELECT status,version FROM app_private.enterprise_team_organizations")).rows,
    [{ status: "active", version: 1 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='member'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    4,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    4,
  );
});
