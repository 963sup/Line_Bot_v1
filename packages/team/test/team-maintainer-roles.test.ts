import assert from "node:assert/strict";
import test from "node:test";
import type { Sql } from "@line_bot_v1/platform/postgres";
import {
  grantTeamMaintainer,
  revokeTeamMaintainer,
} from "../src/adapters/postgres-maintainer-roles.js";
import { TeamError } from "../src/domain/errors/team-error.js";
import { requireAnotherEffectiveMaintainer } from "../src/domain/policies/team-maintenance.js";

type QueryRecord = Readonly<{ text: string; values?: unknown[] }>;

function sqlWith(
  handler: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>,
  queries: QueryRecord[],
): Sql {
  return {
    async query(text, values) {
      queries.push({ text, values });
      return handler(text, values);
    },
  };
}

test("Team owns TeamMaintainer grant and binds it to the current membership epoch", async () => {
  const queries: QueryRecord[] = [];
  const sql = sqlWith(async (text) => {
    if (text.includes("FROM team_memberships")) {
      return { rows: [{ status: "active", version: 4 }] };
    }
    if (text.includes("FROM team_role_assignments")) return { rows: [] };
    if (text.includes("INSERT INTO team_role_assignments")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);

  await grantTeamMaintainer(sql, {
    teamId: "team-1",
    targetUserId: "user-2",
    userStatusVersion: 7,
    now: 100,
  });

  const insert = queries.find((query) => query.text.includes("INSERT INTO team_role_assignments"));
  assert.deepEqual(insert?.values, ["team-1", "user-2", 7, 4, 100]);
  assert.equal(
    queries.some((query) => query.text.includes("identity_access_team_subjects")),
    false,
  );
});

test("Team rebinds a prior TeamMaintainer fact after membership epoch changes", async () => {
  const queries: QueryRecord[] = [];
  const sql = sqlWith(async (text) => {
    if (text.includes("FROM team_memberships")) {
      return { rows: [{ status: "active", version: 9 }] };
    }
    if (text.includes("FROM team_role_assignments")) {
      return {
        rows: [{ status: "revoked", user_status_version: 2, membership_version: 3 }],
      };
    }
    if (text.includes("UPDATE team_role_assignments")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);

  await grantTeamMaintainer(sql, {
    teamId: "team-1",
    targetUserId: "user-2",
    userStatusVersion: 8,
    now: 200,
  });

  const update = queries.find((query) => query.text.includes("UPDATE team_role_assignments"));
  assert.deepEqual(update?.values, ["team-1", "user-2", 8, 9, 200]);
});

test("Team rejects maintainer grants for non-active Team membership", async () => {
  const sql = sqlWith(
    async (text) => {
      if (text.includes("FROM team_memberships")) {
        return { rows: [{ status: "removed", version: 5 }] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    [],
  );

  await assert.rejects(
    () =>
      grantTeamMaintainer(sql, {
        teamId: "team-1",
        targetUserId: "user-2",
        userStatusVersion: 8,
        now: 200,
      }),
    (error: unknown) => error instanceof TeamError && error.status === 403,
  );
});

test("Team owns revoke while domain policy protects the last effective maintainer", async () => {
  assert.throws(
    () =>
      requireAnotherEffectiveMaintainer(
        [
          {
            userId: "user-1",
            userStatus: "active",
            membershipStatus: "active",
            isMaintainer: true,
          },
        ],
        "user-1",
      ),
    (error: unknown) => error instanceof TeamError && error.status === 409,
  );

  const queries: QueryRecord[] = [];
  const sql = sqlWith(async (text) => {
    if (text.includes("SELECT status FROM team_role_assignments")) {
      return { rows: [{ status: "active" }] };
    }
    if (text.includes("UPDATE team_role_assignments")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }, queries);

  await revokeTeamMaintainer(sql, {
    teamId: "team-1",
    targetUserId: "user-2",
    userStatusVersion: 8,
    now: 300,
  });
  assert.ok(queries.some((query) => query.text.includes("status='revoked'")));
});
