import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { executeOrganizationScope } from "../src/application/use-cases/organization-scope.js";
import { createPostgresOrganizationGovernance } from "../src/composition/bootstrap/organization-governance.js";
import type { OrganizationCommand } from "../src/contracts/organization-governance.js";
import type { OrganizationScopeTransactions } from "../src/contracts/output/organization-scope.js";
import {
  normalizeOrganizationName,
  OrganizationError,
  updateOrganizationMemberCreationPolicy,
} from "../src/domain.js";
import { PostgresOrganizationGovernance } from "../src/postgres.js";

const actor = { provider: "line:test", subject: "owner" };

function failure(status: number, code: string, message?: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError &&
    error.status === status &&
    error.code === code &&
    (message === undefined || error.message === message);
}

async function fixture(withOrganization = false) {
  const current = await postgresFixture();
  await current.pg.exec(`
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('member','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES
      ('line:test','owner','owner'),('line:test','member','member');
    ${withOrganization ? "SELECT * FROM app_private.provision_organization_scope('org','owner','scope-org','Scope Org',2);" : ""}
  `);
  return {
    ...current,
    governance: createPostgresOrganizationGovernance(current.db, () => 10),
  };
}

function policyCommand(
  requestId: string,
  expectedVersion = 1,
): Extract<OrganizationCommand, { action: "update-member-creation-policy" }> {
  return {
    action: "update-member-creation-policy",
    requestId,
    organizationAccountId: "org",
    expectedVersion,
    reason: "restrict member creation",
    memberCanCreatePublicRepositories: false,
    memberCanCreatePrivateRepositories: false,
    memberCanCreateInternalRepositories: false,
    memberCanCreateProjectV2: false,
    memberCanCreateTeams: false,
  };
}

test("Organization scope Domain validates names and rejects inactive policy changes before stale versions", () => {
  assert.equal(normalizeOrganizationName(` ${"N".repeat(120)} `), "N".repeat(120));
  assert.throws(
    () => normalizeOrganizationName("N".repeat(121)),
    (error: unknown) => error instanceof OrganizationError && error.code === "invalid-input",
  );
  assert.throws(
    () => updateOrganizationMemberCreationPolicy({ id: "org", status: "inactive", version: 2 }, 1),
    (error: unknown) => error instanceof OrganizationError && error.code === "inactive",
  );
  assert.throws(
    () => updateOrganizationMemberCreationPolicy({ id: "org", status: "active", version: 2 }, 1),
    (error: unknown) => error instanceof OrganizationError && error.code === "conflict",
  );
});

test("Organization creation replay returns before allocating a new scope identity", async () => {
  const command = {
    requestId: "00000000-0000-4000-8000-000000000001",
    reason: "retry creation",
    action: "create-organization",
    login: "existing-org",
    name: "Existing Org",
  } as const;
  const replay = {
    requestId: command.requestId,
    action: command.action,
    scopeId: "existing-organization",
    subjectKind: null,
    subjectId: null,
    status: "active",
    version: 1,
    at: 9,
  } as const;
  const transactions: OrganizationScopeTransactions = {
    transactCreation: (_actor, _evidence, operation) =>
      operation({
        replay: async () => replay,
        nextOrganizationAccountId: () => {
          throw new Error("scope identity must not be allocated on replay");
        },
        provision: async () => {
          throw new Error("scope must not be provisioned on replay");
        },
        record: async () => {
          throw new Error("replay must not be recorded again");
        },
      }),
    transactMemberPolicy: async () => {
      throw new Error("unexpected policy transaction");
    },
  };

  assert.deepEqual(await executeOrganizationScope(transactions, actor, command, 10), replay);
});

test("the public constructor and factory preserve normalized atomic Organization creation and canonical replay", async (t) => {
  const { pg, db, governance } = await fixture();
  t.after(() => pg.close());
  const name = "N".repeat(120);
  const create = {
    requestId: "10000000-0000-4000-8000-000000000001",
    reason: "create Organization",
    action: "create-organization",
    login: "scope-boundary",
    name,
  } as const;

  const direct = new PostgresOrganizationGovernance(db);
  const receipt = await direct.execute(actor, create, 10);
  assert.equal(receipt.version, 1);
  assert.equal(receipt.status, "active");
  assert.deepEqual(await governance.execute(actor, create), receipt);
  const detail = await direct.detail(actor, receipt.scopeId);
  assert.equal(detail.actorIsOwner, true);
  assert.equal(detail.actorMemberRole, "ADMIN");
  assert.deepEqual((await pg.query("SELECT name FROM app_private.organizations")).rows, [{ name }]);
  assert.throws(
    () =>
      governance.execute(actor, {
        ...create,
        requestId: "10000000-0000-4000-8000-000000000002",
        login: "scope-too-long",
        name: "N".repeat(121),
      }),
    failure(400, "invalid-input", "Organization login 或 name 不正確。"),
  );
  assert.throws(
    () =>
      governance.execute(actor, {
        ...create,
        requestId: "10000000-0000-4000-8000-000000000003",
        login: "settings",
      }),
    failure(400, "invalid-input", "Organization login 不正確或已保留。"),
  );
  assert.deepEqual(
    (await pg.query("SELECT count(*)::int AS count FROM app_private.organizations")).rows,
    [{ count: 1 }],
  );
  assert.deepEqual(
    (await pg.query("SELECT scope_id FROM app_private.governance_command_receipts")).rows,
    [{ scope_id: receipt.scopeId }],
  );
});

test("Organization creation rolls back every provisioned fact when audit recording fails", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE FUNCTION app_private.fail_scope_creation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'scope-creation-audit-unavailable'; END $$;
    CREATE TRIGGER fail_scope_creation_audit BEFORE INSERT ON app_private.governance_audit_events
      FOR EACH ROW EXECUTE FUNCTION app_private.fail_scope_creation_audit();
  `);

  await assert.rejects(
    governance.execute(actor, {
      action: "create-organization",
      requestId: "20000000-0000-4000-8000-000000000001",
      login: "rollback-org",
      name: "Rollback Org",
      reason: "verify atomic creation",
    }),
    /scope-creation-audit-unavailable/,
  );

  for (const relation of [
    "organizations",
    "organization_direct_memberships",
    "organization_memberships",
    "organization_role_assignments",
    "governance_command_receipts",
    "governance_audit_events",
  ]) {
    assert.deepEqual(
      (await pg.query(`SELECT count(*)::int AS count FROM app_private.${relation}`)).rows,
      [{ count: 0 }],
    );
  }
  assert.deepEqual(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM app_private.account_logins WHERE account_kind='ORGANIZATION'",
      )
    ).rows,
    [{ count: 0 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM app_private.accounts WHERE kind='ORGANIZATION'",
      )
    ).rows,
    [{ count: 0 }],
  );
});

test("member creation policy persists all five decisions and rechecks current Owner before replay", async (t) => {
  const { pg, governance } = await fixture(true);
  t.after(() => pg.close());
  const command = policyCommand("30000000-0000-4000-8000-000000000001");

  const receipt = await governance.execute(actor, command);
  assert.equal(receipt.version, 2);
  assert.deepEqual(await governance.execute(actor, command), receipt);
  assert.deepEqual(
    (
      await pg.query(`SELECT
        member_can_create_public_repositories,
        member_can_create_private_repositories,
        member_can_create_internal_repositories,
        member_can_create_project_v2,
        member_can_create_teams,
        version
      FROM app_private.organizations WHERE account_id='org'`)
    ).rows,
    [
      {
        member_can_create_public_repositories: false,
        member_can_create_private_repositories: false,
        member_can_create_internal_repositories: false,
        member_can_create_project_v2: false,
        member_can_create_teams: false,
        version: 2,
      },
    ],
  );

  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='owner'; UPDATE app_private.users SET status='active' WHERE id='owner'",
  );
  await assert.rejects(governance.execute(actor, command), failure(403, "forbidden"));
});

test("member creation policy rejects stale or inactive scope and rolls back its decision with audit", async (t) => {
  const stale = await fixture(true);
  t.after(() => stale.pg.close());
  await assert.rejects(
    stale.governance.execute(actor, policyCommand("40000000-0000-4000-8000-000000000001", 2)),
    failure(409, "conflict"),
  );
  await stale.pg.query(
    "UPDATE app_private.organizations SET status='inactive' WHERE account_id='org'",
  );
  await assert.rejects(
    stale.governance.execute(actor, policyCommand("40000000-0000-4000-8000-000000000002", 1)),
    failure(403, "forbidden"),
  );

  const rollback = await fixture(true);
  t.after(() => rollback.pg.close());
  await rollback.pg.exec(`
    CREATE FUNCTION app_private.fail_scope_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'scope-policy-audit-unavailable'; END $$;
    CREATE TRIGGER fail_scope_policy_audit BEFORE INSERT ON app_private.governance_audit_events
      FOR EACH ROW EXECUTE FUNCTION app_private.fail_scope_policy_audit();
  `);
  await assert.rejects(
    rollback.governance.execute(actor, policyCommand("40000000-0000-4000-8000-000000000003")),
    /scope-policy-audit-unavailable/,
  );
  assert.deepEqual(
    (
      await rollback.pg.query(`SELECT
        member_can_create_public_repositories,
        member_can_create_private_repositories,
        member_can_create_internal_repositories,
        member_can_create_project_v2,
        member_can_create_teams,
        version
      FROM app_private.organizations WHERE account_id='org'`)
    ).rows,
    [
      {
        member_can_create_public_repositories: true,
        member_can_create_private_repositories: true,
        member_can_create_internal_repositories: true,
        member_can_create_project_v2: true,
        member_can_create_teams: true,
        version: 1,
      },
    ],
  );
  assert.equal(
    (await rollback.pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    0,
  );
  assert.equal(
    (await rollback.pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    0,
  );
});
