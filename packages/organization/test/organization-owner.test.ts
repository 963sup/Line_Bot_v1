import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  governanceFingerprint,
  isOrganizationOwner,
  recordGovernanceResult,
} from "@line_bot_v1/identity-access/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { executeOrganizationOwner } from "../src/application/use-cases/organization-owner.js";
import { createPostgresOrganizationGovernance } from "../src/composition/bootstrap/organization-governance.js";
import type { OrganizationReceipt } from "../src/contracts/organization-governance.js";
import type { OrganizationOwnerTransactions } from "../src/contracts/output/organization-owner.js";

const actor = { provider: "line:test", subject: "owner" };

test("OrganizationOwner captures one command snapshot before the transaction awaits", async () => {
  const command = {
    action: "grant-organization-owner" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    organizationAccountId: "org",
    targetUserId: "target",
    expectedVersion: 0,
    reason: "snapshot",
  };
  const original = { ...command };
  const transactions: OrganizationOwnerTransactions = {
    transact: async (_actor, scope, evidence, operation) => {
      assert.equal(scope.targetUserId, original.targetUserId);
      assert.deepEqual(JSON.parse(evidence.payload), original);
      command.targetUserId = "changed";
      return operation({
        organization: { id: "org", status: "active", version: 1 },
        authorize: async () => {},
        replay: async () => null,
        membership: async () => ({ status: "active", version: 1 }),
        load: async () => null,
        activeTargetVersion: async () => 1,
        targetEffective: async () => false,
        anotherEffective: async () => false,
        save: async (next) => next.version,
        record: async (result) => {
          assert.equal(result.subjectId, scope.targetUserId);
        },
      });
    },
  };
  const result = await executeOrganizationOwner(transactions, actor, command, 10);
  assert.equal(result.subjectId, original.targetUserId);
});

function failure(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}
async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('backup','active',1),('target','active',1),('outsider','active',1),('paused','paused',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES ('line:test','owner','owner');
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    INSERT INTO app_private.organization_direct_memberships(organization_account_id,user_id,status,version,created_at) VALUES ('org','backup','active',1,2),('org','target','active',1,2),('org','paused','active',1,2);
    SELECT * FROM app_private.refresh_organization_membership('org','backup',2);
    SELECT * FROM app_private.refresh_organization_membership('org','target',2);
    SELECT * FROM app_private.refresh_organization_membership('org','paused',2);
    COMMIT;
  `);
  let sequence = 0;
  const command = (
    action: "grant-organization-owner" | "revoke-organization-owner",
    targetUserId: string,
    expectedVersion: number,
  ) => ({
    action,
    requestId: `cccccccc-cccc-4ccc-8ccc-${String(++sequence).padStart(12, "0")}`,
    organizationAccountId: "org",
    targetUserId,
    expectedVersion,
    reason: "owner characterization",
  });
  return { ...f, command, governance: createPostgresOrganizationGovernance(f.db, () => 100) };
}

test("OrganizationOwner preserves effective-version grants, raw monotonic versions and epoch-qualified last-owner protection", async (t) => {
  const { pg, db, governance, command } = await fixture();
  t.after(() => pg.close());
  const effective = (userId: string) =>
    db.transaction((sql) => isOrganizationOwner(sql, "org", userId));
  await governance.execute(actor, command("grant-organization-owner", "backup", 0));
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='backup'; UPDATE app_private.users SET status='active' WHERE id='backup'",
  );
  assert.equal(await effective("backup"), false);
  const initial = command("grant-organization-owner", "target", 0);
  const granted = await governance.execute(actor, initial);
  assert.equal(granted.version, 1);
  await assert.rejects(
    governance.execute(actor, command("grant-organization-owner", "target", 0)),
    failure(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-organization-owner", "target", 1)),
    failure(409, "invalid-transition"),
  );
  await pg.exec(
    "UPDATE app_private.organization_memberships SET version=version+1 WHERE user_id='target'",
  );
  assert.equal(await effective("target"), false);
  await assert.rejects(
    governance.execute(actor, command("grant-organization-owner", "target", 1)),
    failure(409, "conflict"),
  );
  assert.equal(
    (await governance.execute(actor, command("grant-organization-owner", "target", 0))).version,
    2,
  );
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='target'; UPDATE app_private.users SET status='active' WHERE id='target'",
  );
  assert.equal(await effective("target"), false);
  assert.equal(
    (await governance.execute(actor, command("grant-organization-owner", "target", 0))).version,
    3,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version,user_status_version,membership_version FROM app_private.organization_role_assignments WHERE user_id='target'",
      )
    ).rows,
    [{ status: "active", version: 3, user_status_version: 3, membership_version: 2 }],
  );
  assert.equal(
    (await governance.execute(actor, command("revoke-organization-owner", "target", 3))).version,
    4,
  );
  await assert.rejects(
    governance.execute(actor, command("revoke-organization-owner", "owner", 1)),
    failure(409, "last-effective-role-holder"),
  );
  assert.equal(await effective("owner"), true);
  assert.deepEqual(await governance.execute(actor, initial), granted);
  await assert.rejects(
    governance.execute(actor, { ...initial, reason: "different" }),
    failure(409, "replay-conflict"),
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    5,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    5,
  );
});

test("OrganizationOwner keeps current authority before current or legacy replay and target checks after replay", async (t) => {
  const { pg, db, governance, command } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(actor, command("grant-organization-owner", "outsider", 0)),
    failure(403, "forbidden"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-organization-owner", "paused", 0)),
    failure(404, "not-found"),
  );
  const current = command("grant-organization-owner", "target", 0);
  const receipt = await governance.execute(actor, current);
  const legacy = command("grant-organization-owner", "outsider", 0);
  const historical: OrganizationReceipt = {
    requestId: legacy.requestId,
    action: "grant-OrganizationOwner",
    scopeId: "org",
    subjectKind: "user",
    subjectId: "outsider",
    status: "active",
    version: 1,
    at: 90,
  };
  await db.transaction((sql) =>
    recordGovernanceResult(sql, {
      actorUserId: "owner",
      actorStatusVersion: 1,
      requestId: legacy.requestId,
      fingerprint: governanceFingerprint({
        action: "grant",
        requestId: legacy.requestId,
        scopeKind: "organization",
        scopeId: "org",
        principal: { kind: "user", id: "outsider" },
        role: "OrganizationOwner",
        expectedVersion: 0,
        reason: legacy.reason,
      }),
      action: historical.action,
      scopeKind: "organization",
      scopeId: "org",
      subjectKind: "user",
      subjectId: "outsider",
      reason: legacy.reason,
      at: 90,
      result: historical,
    }),
  );
  assert.deepEqual(await governance.execute(actor, legacy), historical);
  assert.deepEqual(await governance.execute(actor, current), receipt);
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='owner'; UPDATE app_private.users SET status='active' WHERE id='owner'",
  );
  await assert.rejects(governance.execute(actor, current), failure(403, "forbidden"));
  await assert.rejects(governance.execute(actor, legacy), failure(403, "forbidden"));
  assert.deepEqual(
    (
      await pg.query(
        "SELECT * FROM app_private.organization_role_assignments WHERE user_id='outsider'",
      )
    ).rows,
    [],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    2,
  );
});

test("OrganizationOwner grant and revoke roll back role, receipt and audit together", async (t) => {
  const { pg, governance, command } = await fixture();
  t.after(() => pg.close());
  const failAudit = () =>
    pg.exec(`CREATE OR REPLACE FUNCTION app_private.fail_owner_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owner-audit-unavailable'; END $$;
    CREATE TRIGGER fail_owner_audit BEFORE INSERT ON app_private.governance_audit_events FOR EACH ROW EXECUTE FUNCTION app_private.fail_owner_audit()`);
  await failAudit();
  const grant = command("grant-organization-owner", "target", 0);
  await assert.rejects(governance.execute(actor, grant), /owner-audit-unavailable/);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT * FROM app_private.organization_role_assignments WHERE user_id='target'",
      )
    ).rows,
    [],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    0,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    0,
  );
  await pg.exec("DROP TRIGGER fail_owner_audit ON app_private.governance_audit_events");
  await governance.execute(actor, grant);
  await failAudit();
  await assert.rejects(
    governance.execute(actor, command("revoke-organization-owner", "target", 1)),
    /owner-audit-unavailable/,
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.organization_role_assignments WHERE user_id='target'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
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
