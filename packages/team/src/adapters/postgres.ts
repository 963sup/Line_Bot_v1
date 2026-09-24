import { createHash, randomUUID } from "node:crypto";
import {
  readActiveUserQualification,
  readUserQualification,
} from "@line-work/account/adapters/postgres";
import {
  grantTeamMaintainer,
  isTeamMaintainer,
  resolveVerifiedLineActor,
  revokeTeamMaintainer,
} from "@line-work/identity-access/adapters/postgres";
import {
  activeOrganizationParticipantIds,
  listOrganizationTeamScopes,
  qualifyOrganizationTeamScope,
} from "@line-work/organization/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { TeamActor, TeamRepository } from "../application/ports.js";
import type {
  TeamCommandReceipt,
  TeamMembershipView,
  TeamSummary,
  TeamView,
} from "../contracts.js";
import {
  requireAnotherEffectiveMaintainer,
  requireTeamMaintainer,
  type TeamCommand,
  TeamError,
  teamAssert,
  teamSlugFromName,
  teamVersion,
} from "../domain.js";

type TeamRow = {
  id: string;
  organization_account_id: string;
  name: string;
  slug: string;
  version: number;
};

async function lockTeam(sql: Sql, organizationAccountId: string, teamId: string): Promise<TeamRow> {
  const row = (
    await sql.query(
      `SELECT id,organization_account_id,name,slug,version FROM teams
       WHERE id=$1 AND organization_account_id=$2 FOR UPDATE`,
      [teamId, organizationAccountId],
    )
  ).rows[0] as TeamRow | undefined;
  teamAssert(row, 404, "團隊不存在或不屬於所選組織。");
  return row;
}

async function teamMembers(sql: Sql, teamId: string): Promise<TeamMembershipView[]> {
  const rows = (
    await sql.query(
      `SELECT user_id AS "userId",name,status
       FROM team_memberships
       WHERE team_id=$1
       ORDER BY user_id
       FOR SHARE`,
      [teamId],
    )
  ).rows as Array<Omit<TeamMembershipView, "isMaintainer" | "userStatus">>;
  const members: TeamMembershipView[] = [];
  for (const row of rows) {
    const user = await readUserQualification(sql, row.userId);
    members.push({
      ...row,
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
  const rows = (
    await sql.query(
      `SELECT t.id,t.organization_account_id AS "organizationAccountId",t.name,t.slug,t.version,
              m.status AS "membershipStatus"
       FROM teams t
       JOIN team_memberships m ON m.team_id=t.id
       WHERE t.organization_account_id=$1 AND m.user_id=$2 AND m.status<>'removed'
       ORDER BY t.created_at,t.id`,
      [organizationAccountId, userId],
    )
  ).rows as Array<Omit<TeamSummary, "isMaintainer">>;
  const teams: TeamSummary[] = [];
  for (const row of rows) {
    teams.push({ ...row, isMaintainer: await isTeamMaintainer(sql, row.id, userId) });
  }
  return teams;
}

function memberState(member: TeamMembershipView) {
  return {
    userId: member.userId,
    userStatus: member.userStatus,
    membershipStatus: member.status,
    isMaintainer: member.isMaintainer,
  } as const;
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
      teams: [],
      team: null,
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
    teams,
    team: null,
    members: [],
  };
  if (!teamId) return empty;

  const team = await lockTeam(sql, organizationAccountId, teamId);
  const members = await teamMembers(sql, teamId);
  const me = members.find((member) => member.userId === actor.userId && member.status === "active");
  teamAssert(me, 403, "你沒有此團隊的存取權。");
  return {
    ...empty,
    team: {
      id: team.id,
      organizationAccountId: team.organization_account_id,
      name: team.name,
      slug: team.slug,
      version: team.version,
      membershipStatus: me.status,
      isMaintainer: me.isMaintainer,
    },
    members: me.isMaintainer ? members : members.filter((member) => member.status === "active"),
  };
}

export class PostgresTeamRepository implements TeamRepository {
  constructor(private readonly db: Database = businessDatabase()) {}

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
      const team = (
        await sql.query(
          `SELECT id FROM teams
           WHERE organization_account_id=$1 AND slug=$2`,
          [organization.organizationAccountId, teamSlug],
        )
      ).rows[0] as { id: string } | undefined;
      teamAssert(team, 404, "找不到可存取的 Organization Team。");
      return readTeamView(sql, proof, organization.organizationAccountId, team.id, organizations);
    });
  }

  execute(proof: TeamActor, command: TeamCommand, now: number): Promise<TeamCommandReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const actor = await qualifyOrganizationTeamScope(sql, proof, command.organizationAccountId);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${actor.userId}:${command.requestId}`,
      ]);
      const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
      const old = (
        await sql.query(
          `SELECT fingerprint,result,team_id FROM team_commands
           WHERE actor_user_id=$1 AND request_id=$2`,
          [actor.userId, command.requestId],
        )
      ).rows[0];
      if (old) {
        teamAssert(old.fingerprint === fingerprint, 409, "請求編號已用於不同內容。");
        await lockTeam(sql, command.organizationAccountId, old.team_id);
        const current = (await teamMembers(sql, old.team_id)).find(
          (member) => member.userId === actor.userId,
        );
        const selfRemoval =
          command.action === "membership" &&
          command.targetUserId === actor.userId &&
          command.status === "removed";
        teamAssert(
          current?.status === "active" ||
            (command.action === "join" && current?.status === "pending") ||
            selfRemoval,
          403,
          "團隊資格已變更。",
        );
        if (
          command.action === "rename-team" ||
          (command.action === "membership" && !selfRemoval) ||
          command.action === "maintainer"
        ) {
          requireTeamMaintainer(await isTeamMaintainer(sql, old.team_id, actor.userId));
        }
        return old.result as TeamCommandReceipt;
      }

      const teamId = command.action === "create-team" ? randomUUID() : command.teamId;
      const resultUserId =
        command.action === "membership" || command.action === "maintainer"
          ? command.targetUserId
          : actor.userId;
      let details: Record<string, unknown> = {};

      if (command.action === "create-team") {
        const slug = teamSlugFromName(command.name);
        try {
          await sql.query(
            `INSERT INTO teams(id,organization_account_id,name,slug,created_by_user_id,created_at)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [teamId, command.organizationAccountId, command.name, slug, actor.userId, now],
          );
        } catch (error) {
          const postgres = error as { code?: string; constraint?: string };
          if (postgres.code === "23505" && postgres.constraint === "teams_organization_slug") {
            throw new TeamError(409, "此 Organization 已有相同 Team slug。");
          }
          throw error;
        }
        await sql.query(
          `INSERT INTO team_memberships(team_id,user_id,name,status)
           VALUES($1,$2,'建立者','active')`,
          [teamId, actor.userId],
        );
        await grantTeamMaintainer(sql, {
          teamId,
          targetUserId: actor.userId,
          userStatusVersion: actor.userStatusVersion,
          now,
        });
      } else {
        const team = await lockTeam(sql, command.organizationAccountId, teamId);
        const members = await teamMembers(sql, teamId);
        const me = members.find((member) => member.userId === actor.userId);

        if (command.action === "rename-team") {
          requireTeamMaintainer(Boolean(me?.isMaintainer));
          teamVersion(team.version, command.expectedVersion);
          teamAssert(team.name !== command.name, 409, "團隊名稱沒有變更。");
          const slug = teamSlugFromName(command.name);
          try {
            await sql.query("UPDATE teams SET name=$2,slug=$3 WHERE id=$1", [
              teamId,
              command.name,
              slug,
            ]);
          } catch (error) {
            const postgres = error as { code?: string; constraint?: string };
            if (postgres.code === "23505" && postgres.constraint === "teams_organization_slug") {
              throw new TeamError(409, "此 Organization 已有相同 Team slug。");
            }
            throw error;
          }
          details = {
            previousName: team.name,
            previousSlug: team.slug,
            name: command.name,
            slug,
          };
        } else if (command.action === "join") {
          teamAssert(!me || me.status === "pending", 403, "你已加入或曾被移除，請聯絡維護者。");
          await sql.query(
            `INSERT INTO team_memberships(team_id,user_id,name,status)
             VALUES($1,$2,$3,'pending')
             ON CONFLICT(team_id,user_id) DO UPDATE SET name=EXCLUDED.name`,
            [teamId, actor.userId, command.name],
          );
        } else {
          teamAssert(me?.status === "active", 403, "你沒有此團隊的操作權。");
          teamVersion(team.version, command.expectedVersion);
          const target = members.find((member) => member.userId === command.targetUserId);
          teamAssert(target && target.status !== "removed", 404, "找不到此加入申請或有效成員。");

          if (command.action === "membership") {
            const selfRemoval =
              command.targetUserId === actor.userId && command.status === "removed";
            if (!selfRemoval) requireTeamMaintainer(me.isMaintainer);
            if (command.status === "active") {
              const eligible = await activeOrganizationParticipantIds(
                sql,
                command.organizationAccountId,
                [command.targetUserId],
              );
              teamAssert(eligible.has(command.targetUserId), 403, "對象不是此組織的有效使用者。");
            }
            details = {
              userId: command.targetUserId,
              previousStatus: target.status,
              status: command.status,
            };
            if (target.isMaintainer && command.status === "removed") {
              requireAnotherEffectiveMaintainer(members.map(memberState), command.targetUserId);
              const targetUser = await readActiveUserQualification(
                sql,
                command.targetUserId,
                "share",
              );
              teamAssert(targetUser, 403, "對象使用者不可用。");
              await revokeTeamMaintainer(sql, {
                teamId,
                targetUserId: command.targetUserId,
                userStatusVersion: targetUser.statusVersion,
                now,
              });
            }
            await sql.query(
              `UPDATE team_memberships
               SET status=$3,version=CASE WHEN status IS DISTINCT FROM $3 THEN version+1 ELSE version END
               WHERE team_id=$1 AND user_id=$2`,
              [teamId, command.targetUserId, command.status],
            );
          } else {
            requireTeamMaintainer(me.isMaintainer);
            teamAssert(
              target.status === "active",
              409,
              "TeamMaintainer 對象必須是有效 Team member。",
            );
            teamAssert(
              target.isMaintainer !== command.enabled,
              409,
              "TeamMaintainer 狀態沒有變更。",
            );
            const eligible = await activeOrganizationParticipantIds(
              sql,
              command.organizationAccountId,
              [command.targetUserId],
            );
            teamAssert(eligible.has(command.targetUserId), 403, "對象不是此組織的有效使用者。");
            const targetUser = await readActiveUserQualification(
              sql,
              command.targetUserId,
              "share",
            );
            teamAssert(targetUser, 403, "對象使用者不可用。");
            details = {
              userId: command.targetUserId,
              previousMaintainer: target.isMaintainer,
              maintainer: command.enabled,
            };
            if (command.enabled) {
              await grantTeamMaintainer(sql, {
                teamId,
                targetUserId: command.targetUserId,
                userStatusVersion: targetUser.statusVersion,
                now,
              });
            } else {
              requireAnotherEffectiveMaintainer(members.map(memberState), command.targetUserId);
              await revokeTeamMaintainer(sql, {
                teamId,
                targetUserId: command.targetUserId,
                userStatusVersion: targetUser.statusVersion,
                now,
              });
            }
          }
        }
      }

      const updated = (
        await sql.query("UPDATE teams SET version=version+1 WHERE id=$1 RETURNING version", [
          teamId,
        ])
      ).rows[0]!;
      const result: TeamCommandReceipt = {
        organizationAccountId: command.organizationAccountId,
        teamId,
        userId: resultUserId,
      };
      await sql.query(
        `INSERT INTO team_commands(
           actor_user_id,request_id,organization_account_id,team_id,
           fingerprint,result,action,created_at,details
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          actor.userId,
          command.requestId,
          command.organizationAccountId,
          teamId,
          fingerprint,
          JSON.stringify(result),
          command.action,
          now,
          JSON.stringify({ ...details, teamVersion: updated.version }),
        ],
      );
      return result;
    });
  }
}
