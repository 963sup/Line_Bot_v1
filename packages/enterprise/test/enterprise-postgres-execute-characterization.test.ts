import assert from "node:assert/strict";
import test from "node:test";
import { governanceFingerprint } from "@line-work/identity-access/adapters/postgres";
import type { Database, Sql } from "@line-work/platform/adapters/postgres";
import { PostgresEnterpriseGovernance } from "../src/adapters/postgres.js";
import type {
  EnterpriseCommand,
  EnterpriseReceipt,
} from "../src/contracts/enterprise-governance.js";

type QueryRecord = { text: string; values?: unknown[] };

const actor = { provider: "line:test", subject: "line-subject" };

const renameCommand: EnterpriseCommand = {
  action: "rename-enterprise-team",
  requestId: "request-rename-1",
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
  ) => Promise<{ rows: Record<string, any>[] }>,
  queries: QueryRecord[],
) {
  let transactions = 0;
  const sql: Sql = {
    async query(text, values) {
      queries.push({ text, values });
      return responder(text, values);
    },
  };
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

function queryIndex(queries: QueryRecord[], fragment: string) {
  return queries.findIndex((query) => query.text.includes(fragment));
}

test("enterprise execute authorizes current owner before replay lookup", async () => {
  const queries: QueryRecord[] = [];
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "enterprise-1", status: "active", version: 2 }] };
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
  const governance = new PostgresEnterpriseGovernance(db);

  await assert.rejects(
    () => governance.execute(actor, renameCommand, 100),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 403);
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
  const fingerprint = governanceFingerprint(renameCommand);
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "enterprise-1", status: "active", version: 2 }] };
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
  const governance = new PostgresEnterpriseGovernance(db);

  assert.deepEqual(await governance.execute(actor, renameCommand, 100), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "FROM enterprise_teams"), -1);
  assert.equal(queryIndex(queries, "UPDATE enterprise_teams"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("enterprise execute keeps lock authorization replay mutation and durable recording order", async () => {
  const queries: QueryRecord[] = [];
  const { db, transactions } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "enterprise-1", status: "active", version: 2 }] };
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
    if (text.includes("UPDATE enterprise_teams")) return { rows: [{ version: 5 }] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = new PostgresEnterpriseGovernance(db);

  const receipt = await governance.execute(actor, renameCommand, 100);

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

  const globalLock = queryIndex(queries, "pg_advisory_xact_lock(71020260912");
  const actorLookup = queryIndex(queries, "FROM user_identities");
  const requestLock = queries.findIndex(
    (query, index) =>
      index > globalLock && query.text.includes("pg_advisory_xact_lock(hashtext($1))"),
  );
  const enterpriseLock = queryIndex(queries, "FROM enterprises WHERE account_id=$1 FOR UPDATE");
  const authorization = queryIndex(queries, "identity_access_enterprise_scopes");
  const replayLookup = queryIndex(queries, "FROM governance_command_receipts");
  const teamLock = queryIndex(queries, "FROM enterprise_teams");
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
        teamUpdate,
        receiptInsert,
        auditInsert,
      ]),
    ].sort((a, b) => a - b),
  );
  assert.ok(globalLock >= 0);
  assert.deepEqual(queries[requestLock]!.values, ["user-1:request-rename-1"]);
});

test("enterprise create replay short-circuits before provisioning", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseCommand = {
    action: "create-enterprise",
    requestId: "request-create-1",
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
  const fingerprint = governanceFingerprint(command);
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM governance_command_receipts")) {
      return { rows: [{ fingerprint, result: replay }] };
    }
    if (text.includes("provision_enterprise_scope")) {
      throw new Error("provisioning must not run on replay hit");
    }
    throw new Error(`unexpected query after create replay: ${text}`);
  }, queries);
  const governance = new PostgresEnterpriseGovernance(db);

  assert.deepEqual(await governance.execute(actor, command, 100), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "provision_enterprise_scope"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("enterprise lifecycle mutation keeps lifecycle-owner authorization replay update and recording order", async () => {
  const queries: QueryRecord[] = [];
  const command: EnterpriseCommand = {
    action: "deactivate",
    requestId: "request-deactivate-1",
    enterpriseAccountId: "enterprise-1",
    expectedVersion: 2,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM enterprises WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "enterprise-1", status: "active", version: 2 }] };
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
  const governance = new PostgresEnterpriseGovernance(db);

  assert.deepEqual(await governance.execute(actor, command, 100), {
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
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
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
    if (text.includes("UPDATE enterprises")) return { rows: [{ version: 2 }] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = new PostgresEnterpriseGovernance(db);

  const receipt = await governance.execute(actor, command, 100);

  assert.equal(receipt.action, "complete-enterprise-identity");
  assert.equal(receipt.version, 2);
  assert.ok(queryIndex(queries, "FROM enterprise_role_assignments") >= 0);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.deepEqual(
    queries.find((query) => query.text.includes("UPDATE enterprises"))?.values,
    ["enterprise-1", "Acme Enterprise", "acme-enterprise"],
  );
  assert.ok(queryIndex(queries, "INSERT INTO governance_command_receipts") >= 0);
  assert.ok(queryIndex(queries, "INSERT INTO governance_audit_events") >= 0);
});
