import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";

const actor = { provider: "line:test", subject: "owner" };

function command(
  action: "grant-enterprise-owner" | "revoke-enterprise-owner",
  targetUserId: string,
  expectedVersion: number,
  sequence: number,
) {
  return {
    action,
    targetUserId,
    expectedVersion,
    enterpriseAccountId: "ent",
    requestId: `22222222-2222-4222-8222-${String(sequence).padStart(12, "0")}`,
    reason: "owner policy",
  };
}

function failsWith(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}

async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    INSERT INTO app_private.users(id,status,status_version,"createdAt")
      VALUES ('owner','active',1,1),('backup','active',1,1),('outsider','active',1,1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id)
      VALUES ('line:test','owner','owner'),('line:test','backup','backup');
    SELECT * FROM app_private.provision_enterprise_scope('ent','owner','acme','Acme',2);
    INSERT INTO app_private.enterprise_direct_affiliations(enterprise_account_id,user_id,status,version,created_at)
      VALUES ('ent','backup','active',1,2);
  `);
  return { ...f, governance: createPostgresEnterpriseGovernance(f.db, () => 100) };
}

test("EnterpriseOwner mutation preserves current qualification, exact replay and epoch-bound last-owner protection", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const grant = command("grant-enterprise-owner", "backup", 0, 1);
  const granted = await governance.execute(actor, grant);
  assert.equal(granted.version, 1);
  assert.deepEqual(await governance.execute(actor, grant), granted);
  await assert.rejects(
    governance.execute(actor, { ...grant, reason: "changed" }),
    failsWith(409, "replay-conflict"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "backup", 1, 2)),
    failsWith(409, "invalid-transition"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "backup", 0, 3)),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "outsider", 0, 4)),
    failsWith(403, "forbidden"),
  );
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='backup'; UPDATE app_private.users SET status='active' WHERE id='backup'",
  );
  await assert.rejects(
    governance.execute(actor, command("revoke-enterprise-owner", "owner", 1, 5)),
    failsWith(409, "last-effective-role-holder"),
  );
  assert.equal(
    (await governance.execute(actor, command("grant-enterprise-owner", "backup", 1, 6))).version,
    2,
  );
  const revoke = command("revoke-enterprise-owner", "backup", 2, 7);
  const revoked = await governance.execute(actor, revoke);
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.version, 3);
  assert.deepEqual(await governance.execute(actor, revoke), revoked);
  await assert.rejects(
    governance.execute({ provider: "line:test", subject: "backup" }, grant),
    failsWith(403, "forbidden"),
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

test("EnterpriseOwner exact replay still requires current owner authority and target checks remain after replay", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const grant = command("grant-enterprise-owner", "backup", 0, 1);
  const receipt = await governance.execute(actor, grant);
  await pg.exec("UPDATE app_private.users SET status='paused',status_version=2 WHERE id='backup'");
  assert.deepEqual(await governance.execute(actor, grant), receipt);
  await assert.rejects(
    governance.execute(actor, command("revoke-enterprise-owner", "backup", 1, 2)),
    failsWith(404, "not-found"),
  );
  await pg.exec(
    "UPDATE app_private.enterprise_role_assignments SET status='revoked' WHERE user_id='owner'",
  );
  await assert.rejects(governance.execute(actor, grant), failsWith(403, "forbidden"));
});

test("EnterpriseOwner audit failure rolls back role and receipt in the same physical transaction", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  let transactions = 0;
  const failing: Database = {
    transaction(work) {
      transactions++;
      return db.transaction((sql) =>
        work(
          createSql((text, values) => {
            if (text.includes("INSERT INTO governance_audit_events"))
              throw new Error("audit failure");
            return sql.query(text, values);
          }),
        ),
      );
    },
  };
  const governance = createPostgresEnterpriseGovernance(failing, () => 100);
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "backup", 0, 1)),
    /audit failure/,
  );
  assert.equal(transactions, 1);
  assert.equal(
    (await pg.query("SELECT * FROM app_private.enterprise_role_assignments WHERE user_id='backup'"))
      .rows.length,
    0,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    0,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    0,
  );
});
