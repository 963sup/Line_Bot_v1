import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { governanceFingerprint } from "@line_bot_v1/identity-access/postgres";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import type { EnterpriseLifecycleCommand } from "../src/application/commands/enterprise-lifecycle.js";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";
import type {
  EnterpriseCommand,
  EnterpriseReceipt,
} from "../src/contracts/enterprise-governance.js";

type QueryRecord = { text: string; values?: unknown[] };
const governanceLockQuery = "SELECT app_private.lock_governance('exclusive')";

const actor = { provider: "line:test", subject: "line-subject" };

const renameCommand: EnterpriseCommand = {
  action: "rename-enterprise-team",
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
  enterpriseAccountId: "enterprise-1",
  teamId: "team-1",
  name: "Platform",
  expectedVersion: 4,
  reason: "characterization",
};

function databaseWith(
  responder: (
    text: string,
    values: unknown[] | undefined,
  ) => Promise<{ rows: Record<string, unknown>[] }>,
  queries: QueryRecord[],
) {
  let transactions = 0;
  const sql = createSql(async (text, values) => {
    queries.push({ text, ...(values === undefined ? {} : { values }) });
    return responder(text, values);
  });
  const db: Database = {
    async transaction(work) {
      transactions++;
      return work(sql);
    },
  };
  return { db, transactions: () => transactions };
}

function activeActorRow() {
  return {
    id: "user-1",
    status: "active",
    status_version: 7,
    auth_user_id: null,
    createdAt: 1,
  };
}

function activeEnterpriseRow() {
  return {
    account_id: "enterprise-1",
    name: "Enterprise",
    slug: "enterprise",
    status: "active",
    version: 2,
  };
}

function queryIndex(queries: QueryRecord[], fragment: string) {
  return queries.findIndex((query) => query.text.includes(fragment));
}

test("enterprise execute authorizes current owner before replay lookup", async () => {
  const queries: QueryRecord[] = [];
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [activeEnterpriseRow()] };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [] };
    }
    if (text.includes("FROM governance_command_receipts")) {
      throw new Error("replay lookup must not run after failed authorization");
    }
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  await assert.rejects(
    () => governance.execute(actor, renameCommand),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceAccessError);
      assert.equal(error.status, 403);
      return true;
    },
  );

  assert.ok(queryIndex(queries, "FROM enterprise_role_assignments") >= 0);
  assert.equal(queryIndex(queries, "FROM governance_command_receipts"), -1);
  assert.equal(queryIndex(queries, "FROM enterprise_teams"), -1);
});

test("enterprise execute replay hit short-circuits before team lock and write", async () => {
  const queries: QueryRecord[] = [];
  const replay: EnterpriseReceipt = {
    requestId: renameCommand.requestId,
    action: renameCommand.action,
    scopeId: renameCommand.enterpriseAccountId,
    subjectKind: "enterprise-team",
    subjectId: renameCommand.teamId,
    status: "renamed",
    version: 5,
    at: 90,
  };
  const fingerprint = governanceFingerprint({
    requestId: renameCommand.requestId,
    reason: renameCommand.reason,
    action: renameCommand.action,
    enterpriseAccountId: renameCommand.enterpriseAccountId,
    teamId: renameCommand.teamId,
    name: renameCommand.name,
    expectedVersion: renameCommand.expectedVersion,
  });
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [activeEnterpriseRow()] };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM governance_command_receipts")) {
      return { rows: [{ fingerprint, result: replay }] };
    }
    throw new Error(`unexpected query after replay: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  assert.deepEqual(await governance.execute(actor, renameCommand), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "FROM enterprise_teams"), -1);
  assert.equal(queryIndex(queries, "UPDATE enterprise_teams"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("enterprise execute keeps lock authorization replay mutation and durable recording order", async () => {
  const queries: QueryRecord[] = [];
  const { db, transactions } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [activeEnterpriseRow()] };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (text.includes("FROM enterprise_teams") && text.includes("FOR UPDATE")) {
      return { rows: [{ id: "team-1", name: "Old", slug: "old", version: 4 }] };
    }
    if (text.includes("rename_scoped_namespace_name")) {
      return {
        rows: [
          {
            targetKind: "ENTERPRISE_TEAM",
            targetId: "team-1",
            name: "platform",
            currentName: "platform",
            alias: false,
          },
        ],
      };
    }
    if (text.includes("UPDATE enterprise_teams")) return { rows: [{ version: 5 }] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  const receipt = await governance.execute(actor, renameCommand);

  assert.equal(transactions(), 1);
  assert.deepEqual(receipt, {
    requestId: renameCommand.requestId,
    action: renameCommand.action,
    scopeId: renameCommand.enterpriseAccountId,
    subjectKind: "enterprise-team",
    subjectId: renameCommand.teamId,
    status: "renamed",
    version: 5,
    at: 100,
  });

  const globalLock = queryIndex(queries, "lock_governance('exclusive')");
  const actorLookup = queryIndex(queries, "FROM user_identities");
  const requestLock = queries.findIndex(
    (query, index) =>
      index > globalLock && query.text.includes("pg_advisory_xact_lock(hashtext($1))"),
  );
  const enterpriseLock = queryIndex(queries, "FROM enterprises WHERE account_id=$1 FOR UPDATE");
  const authorization = queryIndex(queries, "identity_access_enterprise_scopes");
  const replayLookup = queryIndex(queries, "FROM governance_command_receipts");
  const teamLock = queryIndex(queries, "FROM enterprise_teams");
  const namespaceRename = queryIndex(queries, "rename_scoped_namespace_name");
  const teamUpdate = queryIndex(queries, "UPDATE enterprise_teams");
  const receiptInsert = queryIndex(queries, "INSERT INTO governance_command_receipts");
  const auditInsert = queryIndex(queries, "INSERT INTO governance_audit_events");

  assert.deepEqual(
    [
      globalLock,
      actorLookup,
      requestLock,
      enterpriseLock,
      authorization,
      replayLookup,
      teamLock,
      namespaceRename,
      teamUpdate,
      receiptInsert,
      auditInsert,
    ],
    [
      ...new Set([
        globalLock,
        actorLookup,
        requestLock,
        enterpriseLock,
        authorization,
        replayLookup,
        teamLock,
        namespaceRename,
        teamUpdate,
        receiptInsert,
        auditInsert,
      ]),
    ].sort((a, b) => a - b),
  );
  assert.ok(globalLock >= 0);
  const requestQuery = queries[requestLock];
  assert.ok(requestQuery);
  assert.deepEqual(requestQuery.values, [`user-1:${renameCommand.requestId}`]);
  assert.deepEqual(queries[teamUpdate]?.values, ["enterprise-1", "team-1", "Platform", "platform"]);
});

test("Enterprise owns EnterpriseOwner grant mutation and durable evidence", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseCommand = {
    action: "grant-enterprise-owner",
    requestId: "33333333-3333-4333-8333-000000000001",
    enterpriseAccountId: "enterprise-1",
    targetUserId: "user-2",
    expectedVersion: 0,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [activeEnterpriseRow()] };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (text.includes("SELECT 1 FROM enterprise_direct_affiliations")) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM users WHERE id=$1")) {
      return {
        rows: [
          {
            id: "user-2",
            status: "active",
            status_version: 3,
            auth_user_id: null,
            createdAt: 1,
          },
        ],
      };
    }
    if (
      text.includes("SELECT status,version,user_status_version FROM enterprise_role_assignments") &&
      text.includes("FOR UPDATE")
    ) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO enterprise_role_assignments")) return { rows: [] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected owner mutation query: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  assert.deepEqual(await governance.execute(actor, command), {
    requestId: command.requestId,
    action: command.action,
    scopeId: command.enterpriseAccountId,
    subjectKind: "user",
    subjectId: command.targetUserId,
    status: "active",
    version: 1,
    at: 100,
  });

  const authorization = queryIndex(queries, "identity_access_enterprise_scopes");
  const replayLookup = queryIndex(queries, "FROM governance_command_receipts");
  const roleInsert = queryIndex(queries, "INSERT INTO enterprise_role_assignments");
  const receiptInsert = queryIndex(queries, "INSERT INTO governance_command_receipts");
  const auditInsert = queryIndex(queries, "INSERT INTO governance_audit_events");
  assert.ok(authorization >= 0);
  assert.ok(authorization < replayLookup);
  assert.ok(replayLookup < roleInsert);
  assert.ok(roleInsert < receiptInsert);
  assert.ok(receiptInsert < auditInsert);
});

test("EnterpriseOwner revoke preserves the last-effective-owner invariant", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseCommand = {
    action: "revoke-enterprise-owner",
    requestId: "33333333-3333-4333-8333-000000000002",
    enterpriseAccountId: "enterprise-1",
    targetUserId: "user-1",
    expectedVersion: 1,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [activeEnterpriseRow()] };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (text.includes("SELECT 1 FROM enterprise_direct_affiliations")) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM users WHERE id=$1")) {
      return { rows: [activeActorRow()] };
    }
    if (
      text.includes("SELECT status,version,user_status_version FROM enterprise_role_assignments") &&
      text.includes("FOR UPDATE")
    ) {
      return { rows: [{ status: "active", version: 1, user_status_version: 7 }] };
    }
    if (text.includes("JOIN enterprise_direct_affiliations") && text.includes("r.user_id<>$2")) {
      return { rows: [] };
    }
    if (text.includes("JOIN enterprise_direct_affiliations")) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("UPDATE enterprise_role_assignments")) {
      throw new Error("last effective owner must not be revoked");
    }
    throw new Error(`unexpected last-owner query: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  await assert.rejects(
    () => governance.execute(actor, command),
    (error: unknown) =>
      error instanceof GovernanceAccessError && error.code === "last-effective-role-holder",
  );
  assert.equal(queryIndex(queries, "UPDATE enterprise_role_assignments"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("enterprise create replay short-circuits before provisioning", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseCommand = {
    action: "create-enterprise",
    requestId: "77777777-7777-4777-8777-000000000001",
    slug: "acme",
    name: "Acme",
    reason: "characterization",
  };
  const replay: EnterpriseReceipt = {
    requestId: command.requestId,
    action: command.action,
    scopeId: "enterprise-existing",
    subjectKind: null,
    subjectId: null,
    status: "active",
    version: 3,
    at: 80,
  };
  const fingerprint = governanceFingerprint({
    requestId: command.requestId,
    reason: command.reason,
    action: command.action,
    slug: command.slug,
    name: command.name,
  });
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM governance_command_receipts")) {
      return { rows: [{ fingerprint, result: replay }] };
    }
    if (text.includes("provision_enterprise_scope")) {
      throw new Error("provisioning must not run on replay hit");
    }
    throw new Error(`unexpected query after create replay: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  assert.deepEqual(await governance.execute(actor, command), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "provision_enterprise_scope"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("enterprise lifecycle mutation keeps lifecycle-owner authorization replay update and recording order", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseLifecycleCommand = {
    action: "deactivate",
    requestId: "11111111-1111-4111-8111-111111111111",
    enterpriseAccountId: "enterprise-1",
    expectedVersion: 2,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [activeEnterpriseRow()] };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_subjects") &&
      !text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (text.includes("UPDATE enterprises SET status=$2")) return { rows: [{ version: 3 }] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected lifecycle query: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  assert.deepEqual(await governance.execute(actor, command), {
    requestId: command.requestId,
    action: command.action,
    scopeId: command.enterpriseAccountId,
    subjectKind: null,
    subjectId: null,
    status: "inactive",
    version: 3,
    at: 100,
  });

  const lifecycleAuthorization = queries.findIndex(
    (query) =>
      query.text.includes("FROM enterprise_role_assignments") &&
      query.text.includes("identity_access_enterprise_subjects") &&
      !query.text.includes("identity_access_enterprise_scopes"),
  );
  const replayLookup = queryIndex(queries, "FROM governance_command_receipts");
  const lifecycleUpdate = queryIndex(queries, "UPDATE enterprises SET status=$2");
  const receiptInsert = queryIndex(queries, "INSERT INTO governance_command_receipts");
  const auditInsert = queryIndex(queries, "INSERT INTO governance_audit_events");

  assert.ok(lifecycleAuthorization >= 0);
  assert.ok(lifecycleAuthorization < replayLookup);
  assert.ok(replayLookup < lifecycleUpdate);
  assert.ok(lifecycleUpdate < receiptInsert);
  assert.ok(receiptInsert < auditInsert);
  assert.deepEqual(queries[lifecycleUpdate]?.values, ["enterprise-1", "inactive", 3, 2, "active"]);
});

test("legacy Enterprise identity completion is owner-authorized, versioned, replay-safe, and one-time", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseCommand = {
    action: "complete-enterprise-identity",
    requestId: "11111111-1111-4111-8111-111111111111",
    enterpriseAccountId: "enterprise-1",
    name: "Acme Enterprise",
    slug: "acme-enterprise",
    expectedVersion: 1,
    reason: "owner confirms legacy identity",
  };
  const { db } = databaseWith(async (text) => {
    if (text === governanceLockQuery || text.includes("pg_advisory_xact_lock"))
      return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return {
        rows: [
          {
            account_id: "enterprise-1",
            name: null,
            slug: null,
            status: "active",
            version: 1,
          },
        ],
      };
    }
    if (
      text.includes("FROM enterprise_role_assignments") &&
      text.includes("identity_access_enterprise_scopes")
    ) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (text.includes("claim_scoped_namespace_name")) {
      return {
        rows: [
          {
            targetKind: "ENTERPRISE",
            targetId: "enterprise-1",
            name: "acme-enterprise",
            currentName: "acme-enterprise",
            alias: false,
          },
        ],
      };
    }
    if (text.includes("UPDATE enterprises")) return { rows: [{ version: 2 }] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = createPostgresEnterpriseGovernance(db, () => 100);

  const receipt = await governance.execute(actor, command);

  assert.equal(receipt.action, "complete-enterprise-identity");
  assert.equal(receipt.version, 2);
  assert.ok(queryIndex(queries, "FROM enterprise_role_assignments") >= 0);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.ok(
    queryIndex(queries, "claim_scoped_namespace_name") < queryIndex(queries, "UPDATE enterprises"),
  );
  assert.deepEqual(queries.find((query) => query.text.includes("UPDATE enterprises"))?.values, [
    "enterprise-1",
    "Acme Enterprise",
    "acme-enterprise",
  ]);
  assert.ok(queryIndex(queries, "INSERT INTO governance_command_receipts") >= 0);
  assert.ok(queryIndex(queries, "INSERT INTO governance_audit_events") >= 0);
});
