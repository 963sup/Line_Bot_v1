import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { isOrganizationOwner } from "@line_bot_v1/identity-access/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresOrganizationGovernance } from "../src/composition/bootstrap/organization-governance.js";

function actor(subject: string) {
  return { provider: "line:test", subject };
}
function command(action: string, targetUserId: string, expectedVersion: number) {
  return {
    requestId: randomUUID(),
    reason: "membership characterization",
    action,
    organizationAccountId: "org",
    targetUserId,
    expectedVersion,
  };
}
function selfCommand(action: string, expectedVersion: number) {
  return {
    requestId: randomUUID(),
    reason: "membership characterization",
    action,
    organizationAccountId: "org",
    expectedVersion,
  };
}
function failure(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}
async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('backup','active',1),('target','active',1),('paused','paused',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) SELECT 'line:test',id,id FROM app_private.users;
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    COMMIT;`);
  let at = 100;
  const governance = createPostgresOrganizationGovernance(f.db, () => ++at);
  async function join(userId: string) {
    await governance.execute(actor("owner"), command("invite-member", userId, 0));
    await governance.execute(actor(userId), command("accept-invitation", userId, 1));
  }
  return { ...f, governance, join };
}

test("Organization invitation and direct membership keep independent monotonic versions and exact self replay", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const invite = command("invite-member", "target", 0);
  assert.equal((await governance.execute(actor("owner"), invite)).version, 1);
  assert.deepEqual(
    (await pg.query("SELECT * FROM app_private.organization_memberships WHERE user_id='target'"))
      .rows,
    [],
  );
  await assert.rejects(
    governance.execute(actor("owner"), command("accept-invitation", "target", 1)),
    failure(403, "forbidden"),
  );
  assert.equal(
    (await governance.execute(actor("target"), command("decline-invitation", "target", 1))).version,
    2,
  );
  assert.equal(
    (await governance.execute(actor("owner"), command("invite-member", "target", 2))).version,
    3,
  );
  assert.equal(
    (await governance.execute(actor("owner"), command("cancel-invitation", "target", 3))).version,
    4,
  );
  assert.equal(
    (await governance.execute(actor("owner"), command("invite-member", "target", 4))).version,
    5,
  );
  const accept = command("accept-invitation", "target", 5);
  const accepted = await governance.execute(actor("target"), accept);
  assert.equal(accepted.version, 6);
  assert.deepEqual(await governance.execute(actor("target"), accept), accepted);
  await assert.rejects(
    governance.execute(actor("target"), { ...accept, reason: "changed" }),
    failure(409, "replay-conflict"),
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_direct_memberships WHERE user_id='target'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
  );
  assert.equal(
    (await governance.execute(actor("owner"), command("remove-direct-membership", "target", 1)))
      .version,
    2,
  );
  await governance.execute(actor("owner"), command("invite-member", "target", 6));
  assert.equal(
    (await governance.execute(actor("target"), command("accept-invitation", "target", 7))).version,
    8,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_direct_memberships WHERE user_id='target'",
      )
    ).rows,
    [{ status: "active", version: 3 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='target'",
      )
    ).rows,
    [{ status: "active", version: 3 }],
  );
  const leave = selfCommand("leave-organization", 3);
  const left = await governance.execute(actor("target"), leave);
  assert.equal(left.subjectId, "target");
  assert.equal(left.version, 4);
  await governance.execute(actor("owner"), selfCommand("deactivate", 1));
  assert.deepEqual(await governance.execute(actor("target"), leave), left);
  await assert.rejects(governance.execute(actor("owner"), invite), failure(403, "forbidden"));
});

test("Organization person commands preserve qualification priority, pending-only resolution and current Owner before replay", async (t) => {
  const { pg, governance, join } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(actor("owner"), command("invite-member", "owner", 99)),
    failure(409, "invalid-transition"),
  );
  await assert.rejects(
    governance.execute(actor("owner"), command("invite-member", "paused", 99)),
    failure(404, "not-found"),
  );
  await pg.exec("UPDATE app_private.users SET status='active' WHERE id='paused'");
  await governance.execute(actor("owner"), command("invite-member", "paused", 0));
  await pg.exec("UPDATE app_private.users SET status='paused' WHERE id='paused'");
  assert.equal(
    (await governance.execute(actor("owner"), command("cancel-invitation", "paused", 1))).status,
    "cancelled",
  );
  await assert.rejects(
    governance.execute(actor("owner"), command("cancel-invitation", "paused", 2)),
    failure(409, "conflict"),
  );
  await join("backup");
  await governance.execute(actor("owner"), command("grant-organization-owner", "backup", 0));
  const invite = command("invite-member", "target", 0);
  const receipt = await governance.execute(actor("owner"), invite);
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='owner'; UPDATE app_private.users SET status='active' WHERE id='owner'",
  );
  await assert.rejects(governance.execute(actor("owner"), invite), failure(403, "forbidden"));
  await governance.execute(actor("backup"), command("grant-organization-owner", "owner", 0));
  assert.deepEqual(await governance.execute(actor("owner"), invite), receipt);
});

test("direct-source removal protects the last Owner and preserves independent Team source and Owner epoch", async (t) => {
  const { pg, db, governance, join } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(actor("owner"), selfCommand("leave-organization", 1)),
    failure(409, "last-effective-role-holder"),
  );
  await join("target");
  await governance.execute(actor("owner"), command("grant-organization-owner", "target", 0));
  await pg.exec(`BEGIN;
    SELECT * FROM app_private.provision_enterprise_scope('ent','owner','ent','Ent',100);
    INSERT INTO app_private.enterprise_organizations VALUES ('ent','org','active',1,100,null);
    INSERT INTO app_private.enterprise_teams VALUES ('et','ent','Shared','shared',1,'owner',100);
    SELECT app_private.claim_scoped_namespace_name(
      'enterprise-team-slug','ENTERPRISE','ent','ENTERPRISE_TEAM','et','shared',100
    );
    INSERT INTO app_private.enterprise_team_memberships VALUES ('et','ent','target','active',1,100);
    INSERT INTO app_private.enterprise_team_organizations VALUES ('et','ent','org','active',1,100,null);
    SELECT * FROM app_private.refresh_organization_membership('org','target',100);
    COMMIT;`);
  await assert.rejects(
    governance.execute(actor("target"), selfCommand("leave-organization", 1)),
    failure(409, "scope-conflict"),
  );
  assert.equal(
    (await governance.execute(actor("owner"), command("remove-direct-membership", "target", 1)))
      .version,
    2,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_memberships WHERE user_id='target'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
  );
  assert.equal(await db.transaction((sql) => isOrganizationOwner(sql, "org", "target")), true);
});

test("Organization acceptance rolls back invitation, direct source, membership, receipt and audit together", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await governance.execute(actor("owner"), command("invite-member", "target", 0));
  await pg.exec(`CREATE FUNCTION app_private.fail_membership_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'membership-audit-unavailable'; END $$;
    CREATE TRIGGER fail_membership_audit BEFORE INSERT ON app_private.governance_audit_events FOR EACH ROW EXECUTE FUNCTION app_private.fail_membership_audit()`);
  await assert.rejects(
    governance.execute(actor("target"), command("accept-invitation", "target", 1)),
    /membership-audit-unavailable/,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_invitations WHERE user_id='target'",
      )
    ).rows,
    [{ status: "pending", version: 1 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT * FROM app_private.organization_direct_memberships WHERE user_id='target'",
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    (await pg.query("SELECT * FROM app_private.organization_memberships WHERE user_id='target'"))
      .rows,
    [],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    1,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    1,
  );
});
