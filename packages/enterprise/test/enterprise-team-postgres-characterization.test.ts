import assert from "node:assert/strict";
import test from "node:test";
import type { Sql } from "@line_bot_v1/platform/postgres";
import {
  executeEnterpriseTeamMutation,
  isEnterpriseTeamCommand,
} from "../src/adapters/postgres-team-mutations.js";

test("enterprise team rename preserves lock-before-update query order and receipt", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const sql: Sql = {
    async query(text, values) {
      queries.push({ text, values });
      if (text.includes("FROM enterprise_teams") && text.includes("FOR UPDATE")) {
        return {
          rows: [{ id: "team-1", name: "Old", slug: "old", version: 4 }],
        };
      }
      if (text.includes("UPDATE enterprise_teams")) {
        return { rows: [{ version: 5 }] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  const command = {
    action: "rename-enterprise-team" as const,
    requestId: "request-1",
    enterpriseAccountId: "enterprise-1",
    teamId: "team-1",
    name: "Platform",
    expectedVersion: 4,
    reason: "characterization",
  };

  assert.equal(isEnterpriseTeamCommand(command), true);
  const receipt = await executeEnterpriseTeamMutation(
    sql,
    { status: "active" },
    "user-1",
    command,
    123,
  );

  assert.equal(queries.length, 2);
  assert.match(queries[0]!.text, /FOR UPDATE/);
  assert.match(queries[1]!.text, /UPDATE enterprise_teams/);
  assert.deepEqual(queries[1]!.values, ["enterprise-1", "team-1", "Platform", "platform"]);
  assert.deepEqual(receipt, {
    requestId: "request-1",
    action: "rename-enterprise-team",
    scopeId: "enterprise-1",
    subjectKind: "enterprise-team",
    subjectId: "team-1",
    status: "renamed",
    version: 5,
    at: 123,
  });
});

test("enterprise team command classifier excludes non-team governance commands", () => {
  assert.equal(
    isEnterpriseTeamCommand({
      action: "deactivate",
      requestId: "request-2",
      enterpriseAccountId: "enterprise-1",
      expectedVersion: 1,
      reason: "characterization",
    }),
    false,
  );
});
