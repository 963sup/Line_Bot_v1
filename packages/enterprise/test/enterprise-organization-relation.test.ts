import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";

const actor = { provider: "line:test", subject: "owner" };
function evidence(sequence: number) {
  return {
    requestId: `88888888-8888-4888-8888-${String(sequence).padStart(12, "0")}`,
    reason: "scope relation",
  };
}
function relation(
  action: "attach-organization" | "detach-organization",
  expectedRelationVersion: number,
  sequence: number,
) {
  return {
    ...evidence(sequence),
    action,
    enterpriseAccountId: "ent",
    organizationAccountId: "org",
    expectedEnterpriseVersion: 1,
    expectedOrganizationVersion: 1,
    expectedRelationVersion,
  };
}
function failsWith(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}

async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('other','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES ('line:test','owner','owner'),('line:test','other','other');
    SELECT * FROM app_private.provision_enterprise_scope('ent','owner','ent','Enterprise',2);
    SELECT * FROM app_private.provision_enterprise_scope('other-ent','owner','other-ent','Other Enterprise',2);
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    SELECT * FROM app_private.provision_organization_scope('other-org','other','other-org','Other Org',2);
  `);
  return { ...f, governance: createPostgresEnterpriseGovernance(f.db, () => 100) };
}

test("Enterprise/Organization relation preserves versions, exact replay and inactive-scope detachment", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(actor, {
      ...relation("attach-organization", 0, 1),
      expectedEnterpriseVersion: 2,
    }),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(actor, relation("attach-organization", 1, 2)),
    failsWith(409, "conflict"),
  );
  const attach = relation("attach-organization", 0, 3);
  const attached = await governance.execute(actor, attach);
  assert.equal(attached.status, "active");
  assert.equal(attached.version, 1);
  assert.equal(attached.subjectKind, "organization");
  assert.equal(attached.subjectId, "org");
  assert.deepEqual(await governance.execute(actor, attach), attached);
  await assert.rejects(
    governance.execute(actor, { ...attach, reason: "changed" }),
    failsWith(409, "replay-conflict"),
  );
  await assert.rejects(
    governance.execute(actor, relation("attach-organization", 1, 4)),
    failsWith(409, "conflict"),
  );
  await pg.exec(
    "UPDATE app_private.enterprises SET status='inactive',version=2 WHERE account_id='ent'; UPDATE app_private.organizations SET status='inactive',version=2 WHERE account_id='org'",
  );
  const detach = {
    ...relation("detach-organization", 1, 5),
    expectedEnterpriseVersion: 2,
    expectedOrganizationVersion: 2,
  };
  const detached = await governance.execute(actor, detach);
  assert.equal(detached.status, "detached");
  assert.equal(detached.version, 2);
  assert.deepEqual(await governance.execute(actor, detach), detached);
  await assert.rejects(
    governance.execute(actor, {
      ...relation("attach-organization", 2, 6),
      expectedEnterpriseVersion: 2,
      expectedOrganizationVersion: 2,
    }),
    failsWith(403, "forbidden"),
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    2,
  );
});

test("Enterprise/Organization relation requires both current Owners before replay and enforces one active Enterprise", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(actor, {
      ...relation("attach-organization", 0, 1),
      organizationAccountId: "other-org",
    }),
    failsWith(403, "consent-required"),
  );
  const attach = relation("attach-organization", 0, 2);
  await governance.execute(actor, attach);
  await assert.rejects(
    governance.execute(actor, {
      ...relation("attach-organization", 0, 3),
      enterpriseAccountId: "other-ent",
    }),
    failsWith(409, "scope-conflict"),
  );
  await pg.exec(
    "UPDATE app_private.organization_role_assignments SET status='revoked' WHERE organization_account_id='org' AND user_id='owner'",
  );
  await assert.rejects(governance.execute(actor, attach), failsWith(403, "consent-required"));
  assert.deepEqual(
    (
      await pg.query(
        "SELECT enterprise_account_id,status,version FROM app_private.enterprise_organizations",
      )
    ).rows,
    [{ enterprise_account_id: "ent", status: "active", version: 1 }],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    1,
  );
});

test("Enterprise relation cannot detach until all Enterprise Team assignments are detached", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await governance.execute(actor, relation("attach-organization", 0, 1));
  const team = await governance.execute(actor, {
    ...evidence(2),
    action: "create-enterprise-team",
    enterpriseAccountId: "ent",
    name: "Platform",
  });
  assert.ok(team.subjectId);
  const assignment = {
    enterpriseAccountId: "ent",
    teamId: team.subjectId,
    organizationAccountId: "org",
  };
  await governance.execute(actor, {
    ...evidence(3),
    ...assignment,
    action: "assign-enterprise-team-organization",
    expectedVersion: 0,
  });
  await assert.rejects(
    governance.execute(actor, relation("detach-organization", 1, 4)),
    failsWith(409, "invalid-transition"),
  );
  await governance.execute(actor, {
    ...evidence(5),
    ...assignment,
    action: "detach-enterprise-team-organization",
    expectedVersion: 1,
  });
  assert.equal(
    (await governance.execute(actor, relation("detach-organization", 1, 6))).status,
    "detached",
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    5,
  );
});

test("Enterprise relation audit failure rolls back attach/detach and all command evidence", async (t) => {
  for (const action of ["attach-organization", "detach-organization"] as const) {
    const { pg, db, governance } = await fixture();
    t.after(() => pg.close());
    const existing = action === "detach-organization";
    if (existing) await governance.execute(actor, relation("attach-organization", 0, 1));
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
    const failingGovernance = createPostgresEnterpriseGovernance(failing, () => 100);
    await assert.rejects(
      failingGovernance.execute(actor, relation(action, existing ? 1 : 0, 2)),
      /audit failure/,
    );
    assert.equal(transactions, 1);
    assert.deepEqual(
      (await pg.query("SELECT status,version FROM app_private.enterprise_organizations")).rows,
      existing ? [{ status: "active", version: 1 }] : [],
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
      existing ? 1 : 0,
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
      existing ? 1 : 0,
    );
  }
});
