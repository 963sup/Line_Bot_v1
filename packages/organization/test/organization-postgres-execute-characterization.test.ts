import assert from "node:assert/strict";
import test from "node:test";
import { governanceFingerprint } from "@line_bot_v1/identity-access/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import type {
  OrganizationCommand,
  OrganizationReceipt,
} from "../src/contracts/organization-governance.js";
import { PostgresOrganizationGovernance } from "../src/postgres.js";

type QueryRecord = { text: string; values?: unknown[] };

const actor = { provider: "line:test", subject: "line-subject" };

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

function organizationOwnerQuery(text: string) {
  return (
    text.includes("FROM organization_role_assignments") &&
    text.includes("identity_access_organization_scopes") &&
    text.includes("identity_access_organization_subjects")
  );
}

test("organization execute authorizes current owner before replay lookup", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "deactivate",
    requestId: "request-deactivate-unauthorized",
    organizationAccountId: "organization-1",
    expectedVersion: 3,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM organizations WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "organization-1", status: "active", version: 3 }] };
    }
    if (organizationOwnerQuery(text)) return { rows: [] };
    if (text.includes("FROM governance_command_receipts")) {
      throw new Error("replay lookup must not run after failed authorization");
    }
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  await assert.rejects(
    () => governance.execute(actor, command, 100),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 403);
      return true;
    },
  );

  assert.ok(queries.some((query) => organizationOwnerQuery(query.text)));
  assert.equal(queryIndex(queries, "FROM governance_command_receipts"), -1);
  assert.equal(queryIndex(queries, "FROM organization_memberships"), -1);
});

test("organization replay hit short-circuits before membership row locks and writes", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "invite-member",
    requestId: "request-invite-replay",
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 0,
    reason: "characterization",
  };
  const replay: OrganizationReceipt = {
    requestId: command.requestId,
    action: command.action,
    scopeId: command.organizationAccountId,
    subjectKind: "user",
    subjectId: command.targetUserId,
    status: "pending",
    version: 1,
    at: 90,
  };
  const fingerprint = governanceFingerprint(command);
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM organizations WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "organization-1", status: "active", version: 3 }] };
    }
    if (organizationOwnerQuery(text)) return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM governance_command_receipts")) {
      return { rows: [{ fingerprint, result: replay }] };
    }
    throw new Error(`unexpected query after replay: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  assert.deepEqual(await governance.execute(actor, command, 100), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "FROM organization_memberships"), -1);
  assert.equal(queryIndex(queries, "FROM organization_direct_memberships"), -1);
  assert.equal(queryIndex(queries, "FROM organization_invitations"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("organization lifecycle mutation keeps lock authorization replay update and recording order", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "deactivate",
    requestId: "request-deactivate-1",
    organizationAccountId: "organization-1",
    expectedVersion: 3,
    reason: "characterization",
  };
  const { db, transactions } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM organizations WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "organization-1", status: "active", version: 3 }] };
    }
    if (organizationOwnerQuery(text)) return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (text.includes("UPDATE organizations SET status=$2")) return { rows: [{ version: 4 }] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  const receipt = await governance.execute(actor, command, 100);

  assert.equal(transactions(), 1);
  assert.deepEqual(receipt, {
    requestId: command.requestId,
    action: command.action,
    scopeId: command.organizationAccountId,
    subjectKind: null,
    subjectId: null,
    status: "inactive",
    version: 4,
    at: 100,
  });

  const globalLock = queryIndex(queries, "pg_advisory_xact_lock(71020260912");
  const actorLookup = queryIndex(queries, "FROM user_identities");
  const requestLock = queries.findIndex(
    (query, index) =>
      index > globalLock && query.text.includes("pg_advisory_xact_lock(hashtext($1))"),
  );
  const organizationLock = queryIndex(queries, "FROM organizations WHERE account_id=$1 FOR UPDATE");
  const authorization = queries.findIndex((query) => organizationOwnerQuery(query.text));
  const replayLookup = queryIndex(queries, "FROM governance_command_receipts");
  const lifecycleUpdate = queryIndex(queries, "UPDATE organizations SET status=$2");
  const receiptInsert = queryIndex(queries, "INSERT INTO governance_command_receipts");
  const auditInsert = queryIndex(queries, "INSERT INTO governance_audit_events");

  const order = [
    globalLock,
    actorLookup,
    requestLock,
    organizationLock,
    authorization,
    replayLookup,
    lifecycleUpdate,
    receiptInsert,
    auditInsert,
  ];
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.deepEqual(queries[requestLock]!.values, ["user-1:request-deactivate-1"]);
});

test("Organization owns OrganizationOwner grant mutation and durable evidence", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "grant-organization-owner",
    requestId: "request-owner-grant-1",
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 0,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM organizations WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "organization-1", status: "active", version: 3 }] };
    }
    if (organizationOwnerQuery(text)) return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (
      text.includes("SELECT status,version FROM organization_memberships") &&
      !text.includes("FOR UPDATE")
    ) {
      return { rows: [{ status: "active", version: 5 }] };
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
      text.includes("FROM organization_role_assignments") &&
      text.includes("role='OrganizationOwner' FOR UPDATE")
    ) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO organization_role_assignments")) return { rows: [] };
    if (text.includes("INSERT INTO governance_command_receipts")) return { rows: [] };
    if (text.includes("INSERT INTO governance_audit_events")) return { rows: [] };
    throw new Error(`unexpected owner mutation query: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  assert.deepEqual(await governance.execute(actor, command, 100), {
    requestId: command.requestId,
    action: command.action,
    scopeId: command.organizationAccountId,
    subjectKind: "user",
    subjectId: command.targetUserId,
    status: "active",
    version: 1,
    at: 100,
  });

  const authorization = queries.findIndex((query) => organizationOwnerQuery(query.text));
  const replayLookup = queryIndex(queries, "FROM governance_command_receipts");
  const roleInsert = queryIndex(queries, "INSERT INTO organization_role_assignments");
  const receiptInsert = queryIndex(queries, "INSERT INTO governance_command_receipts");
  const auditInsert = queryIndex(queries, "INSERT INTO governance_audit_events");
  assert.ok(authorization >= 0);
  assert.ok(authorization < replayLookup);
  assert.ok(replayLookup < roleInsert);
  assert.ok(roleInsert < receiptInsert);
  assert.ok(receiptInsert < auditInsert);
});

test("OrganizationOwner revoke preserves the last-effective-owner invariant", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "revoke-organization-owner",
    requestId: "request-owner-revoke-1",
    organizationAccountId: "organization-1",
    targetUserId: "user-1",
    expectedVersion: 1,
    reason: "characterization",
  };
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM organizations WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "organization-1", status: "active", version: 3 }] };
    }
    if (organizationOwnerQuery(text)) return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM governance_command_receipts")) return { rows: [] };
    if (
      text.includes("SELECT status,version FROM organization_memberships") &&
      !text.includes("FOR UPDATE")
    ) {
      return { rows: [{ status: "active", version: 5 }] };
    }
    if (
      text.includes("FROM organization_role_assignments") &&
      text.includes("role='OrganizationOwner' FOR UPDATE")
    ) {
      return {
        rows: [
          {
            status: "active",
            version: 1,
            user_status_version: 7,
            membership_version: 5,
          },
        ],
      };
    }
    if (text.includes("JOIN organization_memberships") && text.includes("r.user_id<>$2")) {
      return { rows: [] };
    }
    if (text.includes("JOIN organization_memberships")) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("UPDATE organization_role_assignments")) {
      throw new Error("last effective owner must not be revoked");
    }
    throw new Error(`unexpected last-owner query: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  await assert.rejects(
    () => governance.execute(actor, command, 100),
    (error: unknown) => (error as { code?: string }).code === "last-effective-role-holder",
  );
  assert.equal(queryIndex(queries, "UPDATE organization_role_assignments"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("legacy OrganizationOwner fingerprint replays after owner migration", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "grant-organization-owner",
    requestId: "request-owner-legacy-replay",
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    expectedVersion: 0,
    reason: "characterization",
  };
  const replay: OrganizationReceipt = {
    requestId: command.requestId,
    action: "grant-OrganizationOwner",
    scopeId: command.organizationAccountId,
    subjectKind: "user",
    subjectId: command.targetUserId,
    status: "active",
    version: 1,
    at: 90,
  };
  const legacyFingerprint = governanceFingerprint({
    action: "grant",
    requestId: command.requestId,
    scopeKind: "organization",
    scopeId: command.organizationAccountId,
    principal: { kind: "user", id: command.targetUserId },
    role: "OrganizationOwner",
    expectedVersion: command.expectedVersion,
    reason: command.reason,
  });
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM organizations WHERE account_id=$1 FOR UPDATE")) {
      return { rows: [{ account_id: "organization-1", status: "active", version: 3 }] };
    }
    if (organizationOwnerQuery(text)) return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM governance_command_receipts")) {
      return { rows: [{ fingerprint: legacyFingerprint, result: replay }] };
    }
    if (
      text.includes("organization_role_assignments") ||
      text.includes("organization_memberships")
    ) {
      throw new Error("legacy replay must short-circuit before OrganizationOwner mutation");
    }
    throw new Error(`unexpected legacy replay query: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  assert.deepEqual(await governance.execute(actor, command, 100), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "INSERT INTO organization_role_assignments"), -1);
  assert.equal(queryIndex(queries, "UPDATE organization_role_assignments"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});

test("organization create replay short-circuits before provisioning", async () => {
  const queries: QueryRecord[] = [];
  const command: OrganizationCommand = {
    action: "create-organization",
    requestId: "request-create-1",
    login: "acme",
    name: "Acme",
    reason: "characterization",
  };
  const replay: OrganizationReceipt = {
    requestId: command.requestId,
    action: command.action,
    scopeId: "organization-existing",
    subjectKind: null,
    subjectId: null,
    status: "active",
    version: 2,
    at: 80,
  };
  const fingerprint = governanceFingerprint(command);
  const { db } = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM user_identities")) return { rows: [activeActorRow()] };
    if (text.includes("FROM governance_command_receipts")) {
      return { rows: [{ fingerprint, result: replay }] };
    }
    if (text.includes("provision_organization_scope")) {
      throw new Error("provisioning must not run on replay hit");
    }
    throw new Error(`unexpected query after create replay: ${text}`);
  }, queries);
  const governance = new PostgresOrganizationGovernance(db);

  assert.deepEqual(await governance.execute(actor, command, 100), replay);
  assert.ok(queryIndex(queries, "FROM governance_command_receipts") >= 0);
  assert.equal(queryIndex(queries, "provision_organization_scope"), -1);
  assert.equal(queryIndex(queries, "INSERT INTO governance_command_receipts"), -1);
});
