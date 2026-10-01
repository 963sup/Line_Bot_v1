import assert from "node:assert/strict";
import test from "node:test";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { grantTeamMaintainer, revokeTeamMaintainer } from "../src/adapters/postgres-maintainer.js";
import { TeamError } from "../src/domain/errors/team-error.js";

type QueryRecord = { text: string; values?: unknown[] };

function sqlWith(
  responder: (
    text: string,
    values: unknown[] | undefined,
  ) => Promise<{ rows: Record<string, any>[] }>,
  queries: QueryRecord[],
): Sql {
  return {
    async query(text, values) {
      queries.push({ text, values });
      return responder(text, values);
    },
  };
}

function activeUser() {
  return {
    id: "user-2",
    status: "active",
    status_version: 7,
    auth_user_id: null,
    createdAt: 1,
  };
}

test("TeamMaintainer grant binds the current User and TeamMembership versions", async () => {
  const queries: QueryRecord[] = [];
  const sql = sqlWith(async (text) => {
    if (text.includes("FROM users WHERE id=$1")) return { rows: [activeUser()] };
    if (text.includes("SELECT m.user_id FROM organizations o")) {
      return { rows: [{ user_id: "user-2" }] };
    }
    if (text.includes("SELECT version FROM team_memberships")) {
      return { rows: [{ version: 4 }] };
    }
    if (text.includes("FROM team_role_assignments") && text.includes("FOR UPDATE")) {
      return {
        rows: [
          {
            status: "active",
            user_status_version: 7,
            membership_version: 2,
          },
        ],
      };
    }
    if (text.includes("UPDATE team_role_assignments SET status='active'")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);

  await grantTeamMaintainer(sql, {
    teamId: "team-1",
    organizationAccountId: "organization-1",
    targetUserId: "user-2",
    userStatusVersion: 7,
    now: 100,
  });

  const update = queries.find((query) =>
    query.text.includes("UPDATE team_role_assignments SET status='active'"),
  );
  assert.ok(update);
  assert.deepEqual(update.values, ["team-1", "user-2", 7, 4, 100]);
});

test("TeamMaintainer grant fails closed without current Organization participation", async () => {
  const queries: QueryRecord[] = [];
  const sql = sqlWith(async (text) => {
    if (text.includes("FROM users WHERE id=$1")) return { rows: [activeUser()] };
    if (text.includes("SELECT m.user_id FROM organizations o")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);

  await assert.rejects(
    () =>
      grantTeamMaintainer(sql, {
        teamId: "team-1",
        organizationAccountId: "organization-1",
        targetUserId: "user-2",
        userStatusVersion: 7,
        now: 100,
      }),
    (error: unknown) => error instanceof TeamError && error.status === 403,
  );
  assert.equal(
    queries.some((query) => query.text.includes("team_role_assignments")),
    false,
  );
});

test("TeamMaintainer revoke preserves the last-effective-maintainer invariant", async () => {
  const queries: QueryRecord[] = [];
  const sql = sqlWith(async (text) => {
    if (text.includes("FROM team_role_assignments") && text.includes("FOR UPDATE")) {
      return { rows: [{ status: "active" }] };
    }
    if (text.includes("JOIN identity_access_team_subjects")) {
      return { rows: [{ "?column?": 1 }] };
    }
    if (text.includes("SELECT user_id FROM team_role_assignments")) return { rows: [] };
    if (text.includes("UPDATE team_role_assignments SET status='revoked'")) {
      throw new Error("last effective maintainer must not be revoked");
    }
    throw new Error(`unexpected query: ${text}`);
  }, queries);

  await assert.rejects(
    () => revokeTeamMaintainer(sql, { teamId: "team-1", targetUserId: "user-1" }),
    (error: unknown) => error instanceof TeamError && error.status === 409,
  );
  assert.equal(
    queries.some((query) =>
      query.text.includes("UPDATE team_role_assignments SET status='revoked'"),
    ),
    false,
  );
});
