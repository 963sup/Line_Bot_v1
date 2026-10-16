import { createHash, randomUUID } from "node:crypto";
import { readActiveUserQualification, readUserQualification } from "@line_bot_v1/account/postgres";
import { NamespaceError } from "@line_bot_v1/namespace";
import { claimScopedName, renameScopedName } from "@line_bot_v1/namespace/postgres";
import {
  activeOrganizationParticipantIds,
  qualifyOrganizationTeamScope,
  readOrganizationViewerCapabilities,
} from "@line_bot_v1/organization/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { TeamError, teamAssert } from "../../../contracts/errors/team-error.js";
import type { TeamActor } from "../../../contracts/input/team-collaboration.js";
import type {
  TeamMutationEvidence,
  TeamMutationScope,
  TeamMutationTransaction,
  TeamMutationTransactions,
  TeamReplay,
} from "../../../contracts/output/team-mutation.js";
import type { TeamCommandReceipt } from "../../../contracts.js";
import type {
  DirectTeamMembership,
  MaintainerAssignment,
  TeamMemberFact,
  TeamState,
} from "../../../domain/team.js";
import { isTeamMaintainer } from "./team-maintainer.js";

function teamRow(row: Record<string, unknown>): TeamState {
  return {
    id: stringValue(row.id),
    organizationAccountId: stringValue(row.organization_account_id),
    name: stringValue(row.name),
    slug: stringValue(row.slug),
    parentTeamId: nullableString(row.parent_team_id),
    privacy: literalValue(row.privacy, ["SECRET", "VISIBLE"]),
    notificationSetting: literalValue(row.notification_setting, [
      "NOTIFICATIONS_DISABLED",
      "NOTIFICATIONS_ENABLED",
    ]),
    version: numberValue(row.version),
  };
}

function membershipRow(row: Record<string, unknown>): DirectTeamMembership {
  return {
    userId: stringValue(row.user_id),
    name: stringValue(row.name),
    status: literalValue(row.status, ["pending", "active", "removed"]),
    version: numberValue(row.version),
  };
}

function receipt(value: unknown): TeamCommandReceipt {
  const result = record(value);
  return {
    organizationAccountId: stringValue(result.organizationAccountId),
    teamId: stringValue(result.teamId),
    userId: stringValue(result.userId),
  };
}

function previousCommandRow(row: Record<string, unknown>) {
  return {
    fingerprint: stringValue(row.fingerprint),
    receipt: receipt(row.result),
    teamId: stringValue(row.team_id),
  };
}

function assignmentRow(row: Record<string, unknown>) {
  return {
    status: literalValue(row.status, ["active", "revoked"]),
    version: numberValue(row.version),
    userStatusVersion: numberValue(row.user_status_version),
    membershipVersion: numberValue(row.membership_version),
  };
}

function versionRow(row: Record<string, unknown>) {
  return { version: numberValue(row.version) };
}

function hasPostgresProperty(error: unknown, key: "code" | "constraint", value: string): boolean {
  if (!(error instanceof Error)) return false;
  return key === "code"
    ? "code" in error && error.code === value
    : "constraint" in error && error.constraint === value;
}

class PostgresTeamMutationTransaction implements TeamMutationTransaction {
  constructor(
    private readonly sql: Sql,
    private readonly scope: TeamMutationScope,
    private readonly evidence: TeamMutationEvidence,
    readonly actor: TeamMutationTransaction["actor"],
    readonly replay: TeamReplay | null,
  ) {}

  newTeamId(): string {
    return randomUUID();
  }

  async lockTeam(teamId: string): Promise<TeamState> {
    const team = (
      await this.sql.query(
        "SELECT id,organization_account_id,name,slug,parent_team_id,privacy,notification_setting,version FROM teams WHERE id=$1 AND organization_account_id=$2 FOR UPDATE",
        [teamId, this.scope.organizationAccountId],
        teamRow,
      )
    ).rows[0];
    teamAssert(team, 404, "團隊不存在或不屬於所選組織。");
    return team;
  }

  lockParent(teamId: string): Promise<TeamState> {
    return this.lockTeam(teamId);
  }

  async directMemberships(teamId: string): Promise<readonly DirectTeamMembership[]> {
    return (
      await this.sql.query(
        "SELECT user_id,name,status,version FROM team_memberships WHERE team_id=$1 ORDER BY user_id FOR SHARE",
        [teamId],
        membershipRow,
      )
    ).rows;
  }

  async memberFacts(teamId: string): Promise<readonly TeamMemberFact[]> {
    const memberships = await this.directMemberships(teamId);
    const facts: TeamMemberFact[] = [];
    for (const membership of memberships) {
      const user = await readUserQualification(this.sql, membership.userId);
      facts.push({
        userId: membership.userId,
        userIsActive: user?.status === "active",
        membershipStatus: membership.status,
        isMaintainer: await isTeamMaintainer(this.sql, teamId, membership.userId),
      });
    }
    return facts;
  }

  isMaintainer(teamId: string, userId: string): Promise<boolean> {
    return isTeamMaintainer(this.sql, teamId, userId);
  }

  activeOrganizationParticipants(userIds: readonly string[]): Promise<ReadonlySet<string>> {
    return activeOrganizationParticipantIds(this.sql, this.scope.organizationAccountId, [
      ...userIds,
    ]);
  }

  async activeUserStatusVersion(userId: string): Promise<number | null> {
    return (await readActiveUserQualification(this.sql, userId, "share"))?.statusVersion ?? null;
  }

  async createTeam(team: TeamState, creatorUserId: string, at: number): Promise<void> {
    try {
      await claimScopedName(this.sql, {
        family: "organization-team-slug",
        scopeKind: "ORGANIZATION",
        scopeId: team.organizationAccountId,
        targetKind: "TEAM",
        targetId: team.id,
        name: team.slug,
        at,
      });
      await this.sql.query(
        "INSERT INTO teams(id,organization_account_id,name,slug,parent_team_id,privacy,notification_setting,version,created_by_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          team.id,
          team.organizationAccountId,
          team.name,
          team.slug,
          team.parentTeamId,
          team.privacy,
          team.notificationSetting,
          team.version,
          creatorUserId,
          at,
        ],
      );
    } catch (error) {
      if (
        (error instanceof NamespaceError && error.status === 409) ||
        (hasPostgresProperty(error, "code", "23505") &&
          hasPostgresProperty(error, "constraint", "teams_organization_slug"))
      ) {
        throw new TeamError(409, "此 Organization 已有相同 Team slug。");
      }
      throw error;
    }
  }

  async saveTeamName(
    teamId: string,
    expectedSlug: string,
    name: string,
    slug: string,
  ): Promise<void> {
    try {
      await renameScopedName(this.sql, {
        family: "organization-team-slug",
        scopeKind: "ORGANIZATION",
        scopeId: this.scope.organizationAccountId,
        targetKind: "TEAM",
        targetId: teamId,
        expectedName: expectedSlug,
        name: slug,
        at: this.evidence.at,
      });
      await this.sql.query("UPDATE teams SET name=$2,slug=$3 WHERE id=$1", [teamId, name, slug]);
    } catch (error) {
      if (
        (error instanceof NamespaceError && error.status === 409) ||
        (hasPostgresProperty(error, "code", "23505") &&
          hasPostgresProperty(error, "constraint", "teams_organization_slug"))
      ) {
        throw new TeamError(409, "此 Organization 已有相同 Team slug。");
      }
      throw error;
    }
  }

  async saveTeamSettings(
    teamId: string,
    privacy: TeamState["privacy"],
    notificationSetting: TeamState["notificationSetting"],
  ): Promise<void> {
    await this.sql.query("UPDATE teams SET privacy=$2,notification_setting=$3 WHERE id=$1", [
      teamId,
      privacy,
      notificationSetting,
    ]);
  }

  async saveTeamParent(teamId: string, parentTeamId: string | null): Promise<void> {
    try {
      await this.sql.query("UPDATE teams SET parent_team_id=$2 WHERE id=$1", [
        teamId,
        parentTeamId,
      ]);
    } catch (error) {
      if (
        hasPostgresProperty(error, "code", "23514") ||
        hasPostgresProperty(error, "constraint", "teams_parent_scope_fkey") ||
        (error instanceof Error && error.message.includes("team_hierarchy_cycle"))
      ) {
        throw new TeamError(409, "Team hierarchy 無效或形成 cycle。");
      }
      throw error;
    }
  }

  async saveMembership(teamId: string, membership: DirectTeamMembership): Promise<void> {
    await this.sql.query(
      "INSERT INTO team_memberships(team_id,user_id,name,status,version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(team_id,user_id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,version=EXCLUDED.version",
      [teamId, membership.userId, membership.name, membership.status, membership.version],
    );
  }

  async maintainerAssignment(
    teamId: string,
    targetUserId: string,
  ): Promise<MaintainerAssignment | null> {
    return (
      (
        await this.sql.query(
          "SELECT status,version,user_status_version,membership_version FROM team_role_assignments WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' FOR UPDATE",
          [teamId, targetUserId],
          assignmentRow,
        )
      ).rows[0] ?? null
    );
  }

  async saveMaintainerAssignment(
    teamId: string,
    targetUserId: string,
    assignment: MaintainerAssignment,
    at: number,
  ): Promise<void> {
    if (assignment.version === 1) {
      await this.sql.query(
        "INSERT INTO team_role_assignments(team_id,user_id,role,status,version,user_status_version,membership_version,granted_at) VALUES($1,$2,'TeamMaintainer',$3,$4,$5,$6,$7)",
        [
          teamId,
          targetUserId,
          assignment.status,
          assignment.version,
          assignment.userStatusVersion,
          assignment.membershipVersion,
          at,
        ],
      );
      return;
    }
    const updated = (
      await this.sql.query(
        assignment.status === "active"
          ? "UPDATE team_role_assignments SET status=$3,version=$4,user_status_version=$5,membership_version=$6,granted_at=$7 WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' AND version=$8 RETURNING version"
          : "UPDATE team_role_assignments SET status=$3,version=$4,user_status_version=$5,membership_version=$6 WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' AND version=$7 RETURNING version",
        assignment.status === "active"
          ? [
              teamId,
              targetUserId,
              assignment.status,
              assignment.version,
              assignment.userStatusVersion,
              assignment.membershipVersion,
              at,
              assignment.version - 1,
            ]
          : [
              teamId,
              targetUserId,
              assignment.status,
              assignment.version,
              assignment.userStatusVersion,
              assignment.membershipVersion,
              assignment.version - 1,
            ],
        versionRow,
      )
    ).rows[0];
    if (!updated) throw new TeamError(409, "TeamMaintainer 資料已更新。");
  }

  async incrementTeamVersion(teamId: string): Promise<number> {
    const updated = (
      await this.sql.query(
        "UPDATE teams SET version=version+1 WHERE id=$1 RETURNING version",
        [teamId],
        versionRow,
      )
    ).rows[0];
    if (!updated) throw new TeamError(409, "團隊版本已更新，請重新讀取。");
    return updated.version;
  }

  async record(
    teamId: string,
    result: TeamCommandReceipt,
    details: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.sql.query(
      "INSERT INTO team_commands(actor_user_id,request_id,organization_account_id,team_id,fingerprint,result,action,created_at,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        this.actor.userId,
        this.evidence.requestId,
        this.scope.organizationAccountId,
        teamId,
        createHash("sha256").update(this.evidence.payload).digest("hex"),
        JSON.stringify(result),
        this.evidence.action,
        this.evidence.at,
        JSON.stringify(details),
      ],
    );
  }
}

export class PostgresTeamMutationTransactions implements TeamMutationTransactions {
  constructor(private readonly db: Database) {}

  transact<T>(
    proof: TeamActor,
    scope: TeamMutationScope,
    evidence: TeamMutationEvidence,
    operation: (transaction: TeamMutationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      const actor = await qualifyOrganizationTeamScope(sql, proof, scope.organizationAccountId);
      const capabilities = await readOrganizationViewerCapabilities(
        sql,
        actor.userId,
        scope.organizationAccountId,
      );
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        actor.userId + ":" + evidence.requestId,
      ]);
      const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
      const previous = (
        await sql.query(
          "SELECT fingerprint,result,team_id FROM team_commands WHERE actor_user_id=$1 AND request_id=$2",
          [actor.userId, evidence.requestId],
          previousCommandRow,
        )
      ).rows[0];
      const replay = previous
        ? {
            evidenceMatches: previous.fingerprint === fingerprint,
            receipt: previous.receipt,
            teamId: previous.teamId,
          }
        : null;
      return operation(
        new PostgresTeamMutationTransaction(
          sql,
          scope,
          evidence,
          {
            userId: actor.userId,
            userStatusVersion: actor.userStatusVersion,
            isOrganizationOwner: capabilities?.viewerCanAdminister === true,
            canCreateTeams: capabilities?.viewerCanCreateTeams === true,
          },
          replay,
        ),
      );
    });
  }
}
