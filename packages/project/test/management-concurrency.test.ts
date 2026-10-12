import assert from "node:assert/strict";
import test from "node:test";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { readProjectReceipt } from "../src/adapters/outbound/persistence/postgres-project-management-helpers.js";
import { PostgresProjectManagementStore } from "../src/adapters/outbound/persistence/postgres-project-management-store.js";
import { ProjectError } from "../src/domain.js";

type QueryRecord = { text: string; values?: unknown[] };

function databaseWith(
  responder: (
    text: string,
    values: unknown[] | undefined,
  ) => Promise<{
    rows: Record<string, unknown>[];
  }>,
  queries: QueryRecord[],
): Database {
  const sql = createSql(async (text, values) => {
    queries.push({ text, ...(values === undefined ? {} : { values }) });
    return responder(text, values);
  });
  return {
    transaction: (work) => work(sql),
  };
}

function queryIndex(queries: QueryRecord[], fragment: string) {
  return queries.findIndex((query) => query.text.includes(fragment));
}

test("Project management takes a shared governance lock before replay and capability checks", async () => {
  const queries: QueryRecord[] = [];
  const db = databaseWith(async (text) => {
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("FROM project_commands")) return { rows: [] };
    if (text.includes("FROM users")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);
  const store = new PostgresProjectManagementStore(db);

  await assert.rejects(
    () =>
      store.execute(
        { userId: "user-1" },
        {
          action: "create-project",
          requestId: "request-project-governance-lock",
          ownerAccountId: "organization-1",
          ownerKind: "ORGANIZATION",
          expectedVersion: 0,
          title: "Organization plan",
          public: false,
          repositoryId: null,
          teamId: null,
        },
        100,
      ),
    (error: unknown) => error instanceof ProjectError && error.status === 403,
  );

  const governanceLock = queryIndex(queries, "pg_advisory_xact_lock_shared(71020260912");
  assert.equal(queryIndex(queries, "pg_advisory_xact_lock(71020260912"), -1);
  const requestLock = queries.findIndex(
    (query, index) =>
      index > governanceLock && query.text.includes("pg_advisory_xact_lock(hashtext($1))"),
  );
  const replayLookup = queryIndex(queries, "FROM project_commands");
  const capabilityQualification = queryIndex(queries, "FROM users");

  const order = [governanceLock, requestLock, replayLookup, capabilityQualification];
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );
});

test("Project management rejects a stored replay receipt with an incomplete result contract", async () => {
  const db = databaseWith(async (text) => {
    if (text.includes("FROM project_commands")) {
      return {
        rows: [
          {
            fingerprint: "fingerprint",
            result: {
              receiptVersion: 1,
              family: "project-management",
              result: {
                requestId: "request-1",
                action: "update-project",
                projectId: "project-1",
                resourceId: null,
                version: 1,
                at: 100,
              },
            },
          },
        ],
      };
    }
    throw new Error(`unexpected query: ${text}`);
  }, []);

  await assert.rejects(
    db.transaction((sql) => readProjectReceipt(sql, "user-1", "request-1", "fingerprint")),
    (error: unknown) => error instanceof ProjectError && error.status === 503,
  );
});
