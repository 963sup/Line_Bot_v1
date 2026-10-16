import { readUserQualification } from "@line_bot_v1/account/postgres";
import { resolveVerifiedLineActor } from "@line_bot_v1/identity-access/postgres";
import { resolveScopedName } from "@line_bot_v1/namespace/postgres";
import {
  listOrganizationTeamScopes,
  qualifyOrganizationTeamScope,
  readOrganizationViewerCapabilities,
} from "@line_bot_v1/organization/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { teamAssert } from "../../../contracts/errors/team-error.js";
import type { TeamActor } from "../../../contracts/input/team-collaboration.js";
import type { TeamQuery } from "../../../contracts/output/team-query.js";
import type { TeamMembershipView, TeamSummary, TeamView } from "../../../contracts.js";
import { isTeamMaintainer } from "./team-maintainer.js";

type TeamRow = {
  id: string;
  organization_account_id: string;
  name: string;
  slug: string;
  parent_team_id: string | null;
  privacy: "SECRET" | "VISIBLE";
  notification_setting: "NOTIFICATIONS_DISABLED" | "NOTIFICATIONS_ENABLED";
  version: number;
};

function teamRow(row: Record<string, unknown>): TeamRow {
  return {
    id: stringValue(row.id),
    organization_account_id: stringValue(row.organization_account_id),
    name: stringValue(row.name),
    slug: stringValue(row.slug),
    parent_team_id: nullableString(row.parent_team_id),
    privacy: literalValue(row.privacy, ["SECRET", "VISIBLE"]),
    notification_setting: literalValue(row.notification_setting, [
      "NOTIFICATIONS_DISABLED",
      "NOTIFICATIONS_ENABLED",
    ]),
    version: numberValue(row.version),
  };
}

function directMemberRow(row: Record<string, unknown>) {
  return {
    userId: stringValue(row.userId),
    name: stringValue(row.name),
    status: literalValue(row.status, ["pending", "active", "removed"]),
  };
}

function effectiveMemberRow(row: Record<string, unknown>) {
  return {
    userId: stringValue(row.userId),
    name: stringValue(row.name),
    membershipType: literalValue(row.membershipType, ["IMMEDIATE", "CHILD_TEAM"]),
    sourceTeamId: stringValue(row.sourceTeamId),
  };
}

function teamSummaryRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    organizationAccountId: stringValue(row.organizationAccountId),
    name: stringValue(row.name),
    slug: stringValue(row.slug),
    parentTeamId: nullableString(row.parentTeamId),
    privacy: literalValue(row.privacy, ["SECRET", "VISIBLE"]),
    notificationSetting: literalValue(row.notificationSetting, [
      "NOTIFICATIONS_DISABLED",
      "NOTIFICATIONS_ENABLED",
    ]),
    version: numberValue(row.version),
    membershipStatus: literalValue(row.membershipStatus, ["none", "pending", "active", "removed"]),
    membershipType:
      row.membershipType === null
        ? null
        : literalValue(row.membershipType, ["IMMEDIATE", "CHILD_TEAM"]),
  };
}

async function lockTeam(sql: Sql, organizationAccountId: string, teamId: string): Promise<TeamRow> {
  const row = (
    await sql.query(
      `SELECT id,organization_account_id,name,slug,parent_team_id,privacy,notification_setting,version FROM teams
      WHERE id=$1 AND organization_account_id=$2 FOR UPDATE`,
      [teamId, organizationAccountId],
      teamRow,
    )
  ).rows[0];
  teamAssert(row, 404, "團隊不存在或不屬於所選組織。");
  return row;
}

async function directTeamMembers(sql: Sql, teamId: string): Promise<TeamMembershipView[]> {
  const rows = (
    await sql.query(
      `SELECT user_id AS "userId",name,status
       FROM team_memberships
       WHERE team_id=$1
       ORDER BY user_id
      FOR SHARE`,
      [teamId],
      directMemberRow,
    )
  ).rows;
  const members: TeamMembershipView[] = [];
  for (const row of rows) {
    const user = await readUserQualification(sql, row.userId);
    members.push({
      ...row,
      userStatus: user?.status ?? "suspended",
      isMaintainer: await isTeamMaintainer(sql, teamId, row.userId),
      membershipType: row.status === "active" ? "IMMEDIATE" : null,
      sourceTeamId: row.status === "active" ? teamId : null,
    });
  }
  return members;
}

async function effectiveTeamMembers(sql: Sql, teamId: string): Promise<TeamMembershipView[]> {
  const rows = (
    await sql.query(
      `SELECT DISTINCT ON (em.user_id)
              em.user_id AS "userId",
              source_membership.name,
              em.membership_type AS "membershipType",
              em.source_team_id AS "sourceTeamId"
       FROM team_effective_memberships em
       JOIN team_memberships source_membership
         ON source_membership.team_id=em.source_team_id
        AND source_membership.user_id=em.user_id
        AND source_membership.status='active'
       WHERE em.team_id=$1
       ORDER BY em.user_id,
                CASE WHEN em.membership_type='IMMEDIATE' THEN 0 ELSE 1 END,
                em.depth,
                em.source_team_id`,
      [teamId],
      effectiveMemberRow,
    )
  ).rows;
  const members: TeamMembershipView[] = [];
  for (const row of rows) {
    const user = await readUserQualification(sql, row.userId);
    members.push({
      ...row,
      status: "active",
      userStatus: user?.status ?? "suspended",
      isMaintainer: await isTeamMaintainer(sql, teamId, row.userId),
    });
  }
  return members;
}

async function teamSummaries(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
): Promise<TeamSummary[]> {
  const owner =
    (await readOrganizationViewerCapabilities(sql, userId, organizationAccountId))
      ?.viewerCanAdminister === true;
  const rows = (
    await sql.query(
      `SELECT
         t.id,
         t.organization_account_id AS "organizationAccountId",
         t.name,
         t.slug,
         t.parent_team_id AS "parentTeamId",
         t.privacy,
         t.notification_setting AS "notificationSetting",
         t.version,
         CASE
           WHEN em.user_id IS NOT NULL THEN 'active'
           ELSE COALESCE(direct_membership.status,'none')
         END AS "membershipStatus",
         em.membership_type AS "membershipType"
       FROM teams t
       LEFT JOIN team_memberships direct_membership
         ON direct_membership.team_id=t.id
        AND direct_membership.user_id=$2
       LEFT JOIN LATERAL (
         SELECT m.user_id,m.membership_type
         FROM team_effective_memberships m
         WHERE m.team_id=t.id AND m.user_id=$2
         ORDER BY
           CASE WHEN m.membership_type='IMMEDIATE' THEN 0 ELSE 1 END,
           m.depth,
           m.source_team_id
         LIMIT 1
       ) em ON true
       WHERE t.organization_account_id=$1
         AND ($3::boolean OR t.privacy='VISIBLE' OR em.user_id IS NOT NULL)
       ORDER BY t.created_at,t.id`,
      [organizationAccountId, userId, owner],
      teamSummaryRow,
    )
  ).rows;
  const teams: TeamSummary[] = [];
  for (const row of rows) {
    const isMaintainer = await isTeamMaintainer(sql, row.id, userId);
    teams.push({ ...row, isMaintainer, canManage: owner || isMaintainer });
  }
  return teams;
}

async function readTeamView(
  sql: Sql,
  proof: TeamActor,
  organizationAccountId: string,
  teamId: string,
  visibleOrganizations?: Array<{ organizationAccountId: string; login: string }>,
): Promise<TeamView> {
  const organizations = visibleOrganizations ?? (await listOrganizationTeamScopes(sql, proof));
  if (!organizationAccountId) {
    const actor = await resolveVerifiedLineActor(sql, proof);
    return {
      userId: actor.userId,
      organizations,
      organizationAccountId: null,
      organizationLogin: null,
      viewerCanCreateTeams: false,
      teams: [],
      team: null,
      childTeams: [],
      members: [],
    };
  }

  const actor = await qualifyOrganizationTeamScope(sql, proof, organizationAccountId);
  const teams = await teamSummaries(sql, organizationAccountId, actor.userId);
  const empty: TeamView = {
    userId: actor.userId,
    organizations,
    organizationAccountId,
    organizationLogin: actor.organizationLogin,
    viewerCanCreateTeams: false,
    teams,
    team: null,
    childTeams: [],
    members: [],
  };
  if (!teamId) {
    const capabilities = await readOrganizationViewerCapabilities(
      sql,
      actor.userId,
      organizationAccountId,
    );
    return { ...empty, viewerCanCreateTeams: capabilities?.viewerCanCreateTeams === true };
  }

  const team = await lockTeam(sql, organizationAccountId, teamId);
  const directMembers = await directTeamMembers(sql, teamId);
  const effectiveMembers = await effectiveTeamMembers(sql, teamId);
  const me = effectiveMembers.find((member) => member.userId === actor.userId);
  const capabilities = await readOrganizationViewerCapabilities(
    sql,
    actor.userId,
    organizationAccountId,
  );
  const owner = capabilities?.viewerCanAdminister === true;
  teamAssert(team.privacy === "VISIBLE" || me || owner, 404, "找不到可存取的 Organization Team。");
  const directMe = directMembers.find((member) => member.userId === actor.userId);
  const maintainer = await isTeamMaintainer(sql, teamId, actor.userId);
  const inactiveDirect = directMembers.filter(
    (member) =>
      member.status !== "active" &&
      !effectiveMembers.some((effective) => effective.userId === member.userId),
  );
  const members =
    maintainer || owner
      ? [...effectiveMembers, ...inactiveDirect].sort((a, b) => a.userId.localeCompare(b.userId))
      : effectiveMembers;
  return {
    ...empty,
    viewerCanCreateTeams: capabilities?.viewerCanCreateTeams === true,
    team: {
      id: team.id,
      organizationAccountId: team.organization_account_id,
      name: team.name,
      slug: team.slug,
      parentTeamId: team.parent_team_id,
      privacy: team.privacy,
      notificationSetting: team.notification_setting,
      version: team.version,
      membershipStatus: me ? "active" : (directMe?.status ?? "none"),
      membershipType: me?.membershipType ?? null,
      isMaintainer: maintainer,
      canManage: maintainer || owner,
    },
    childTeams: teams.filter((item) => item.parentTeamId === teamId),
    members,
  };
}

export class PostgresTeamQuery implements TeamQuery {
  constructor(private readonly db: Database) {}

  async view(proof: TeamActor, organizationAccountId: string, teamId: string): Promise<TeamView> {
    return this.db.transaction((sql) => readTeamView(sql, proof, organizationAccountId, teamId));
  }

  async viewByLocator(
    proof: TeamActor,
    organizationLogin: string,
    teamSlug: string,
  ): Promise<TeamView> {
    return this.db.transaction(async (sql) => {
      const organizations = await listOrganizationTeamScopes(sql, proof);
      const organization = organizations.find((item) => item.login === organizationLogin);
      teamAssert(organization, 404, "找不到可存取的 Organization Team。");
      const binding = await resolveScopedName(
        sql,
        {
          family: "organization-team-slug",
          scopeKind: "ORGANIZATION",
          scopeId: organization.organizationAccountId,
        },
        teamSlug,
      );
      teamAssert(binding?.targetKind === "TEAM", 404, "找不到可存取的 Organization Team。");
      return readTeamView(
        sql,
        proof,
        organization.organizationAccountId,
        binding.targetId,
        organizations,
      );
    });
  }
}
