import type { RoleAssignmentPort } from "@line-work/identity-access/application/ports/role-assignments";
import type {
  GovernanceReceipt,
  VerifiedLineActor,
} from "@line-work/identity-access/contracts/governance";
import type { ScopedRoleCommand } from "@line-work/identity-access/domain/role-assignment";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import { requireActiveTargetUser, resolveVerifiedLineActor } from "./actor.js";
import { governanceFingerprint, readGovernanceReplay, recordGovernanceResult } from "./receipts.js";
import {
  grantTeamMaintainer,
  hasReplacementEnterpriseOwner,
  hasReplacementOrganizationOwner,
  isEnterpriseOwner,
  isOrganizationOwner,
  isTeamMaintainer,
  requireEnterpriseOwner,
  requireOrganizationOwner,
  revokeTeamMaintainer,
} from "./typed-role-assignments.js";

type AssignmentResult = { status: "active" | "revoked"; version: number };

async function hasDirectEnterpriseAffiliation(sql: Sql, enterpriseId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1 FROM identity_access_enterprise_subjects
         WHERE enterprise_account_id=$1 AND user_id=$2
           AND affiliation_status='active' LIMIT 1`,
        [enterpriseId, userId],
      )
    ).rows[0],
  );
}

async function mutateEnterpriseUserAssignment(
  sql: Sql,
  command: ScopedRoleCommand,
  now: number,
): Promise<AssignmentResult> {
  const userId = command.principal.id;
  const scope = (
    await sql.query("SELECT status FROM identity_access_enterprise_scopes WHERE account_id=$1", [
      command.scopeId,
    ])
  ).rows[0];
  if (!scope) throw new GovernanceAccessError(404, "not-found", "找不到角色範圍。");
  if (scope.status !== "active") {
    throw new GovernanceAccessError(409, "inactive", "停用的範圍不能變更角色。");
  }
  if (!(await hasDirectEnterpriseAffiliation(sql, command.scopeId, userId))) {
    throw new GovernanceAccessError(
      403,
      "forbidden",
      "EnterpriseOwner 對象必須有 active direct Enterprise affiliation。",
    );
  }
  const target = await requireActiveTargetUser(sql, userId);
  const assignment = (
    await sql.query(
      `SELECT status,version,user_status_version FROM enterprise_role_assignments
       WHERE enterprise_account_id=$1 AND user_id=$2 AND role=$3 FOR UPDATE`,
      [command.scopeId, userId, command.role],
    )
  ).rows[0];
  if (command.action === "grant") {
    if (
      (!assignment && command.expectedVersion !== 0) ||
      (assignment && assignment.version !== command.expectedVersion)
    ) {
      throw new GovernanceAccessError(409, "conflict", "角色指派版本已更新。");
    }
    if (
      assignment?.status === "active" &&
      assignment.user_status_version === target.userStatusVersion
    ) {
      throw new GovernanceAccessError(409, "invalid-transition", "角色已生效。");
    }
    if (assignment) {
      const changed = (
        await sql.query(
          `UPDATE enterprise_role_assignments
           SET status='active',version=version+1,user_status_version=$4,granted_at=$5
           WHERE enterprise_account_id=$1 AND user_id=$2 AND role=$3 RETURNING version`,
          [command.scopeId, userId, command.role, target.userStatusVersion, now],
        )
      ).rows[0]!;
      return { status: "active", version: changed.version };
    }
    await sql.query(
      `INSERT INTO enterprise_role_assignments(
         enterprise_account_id,user_id,role,status,version,user_status_version,granted_at
       ) VALUES($1,$2,$3,'active',1,$4,$5)`,
      [command.scopeId, userId, command.role, target.userStatusVersion, now],
    );
    return { status: "active", version: 1 };
  }
  if (!assignment) throw new GovernanceAccessError(404, "not-found", "找不到角色指派。");
  if (assignment.version !== command.expectedVersion)
    throw new GovernanceAccessError(409, "conflict", "角色指派版本已更新。");
  if (assignment.status !== "active")
    throw new GovernanceAccessError(409, "invalid-transition", "角色已撤銷。");
  if (
    (await isEnterpriseOwner(sql, command.scopeId, userId)) &&
    !(await hasReplacementEnterpriseOwner(sql, command.scopeId, userId))
  ) {
    throw new GovernanceAccessError(
      409,
      "last-effective-role-holder",
      "不能撤銷最後一位有效 EnterpriseOwner。",
    );
  }
  const changed = (
    await sql.query(
      `UPDATE enterprise_role_assignments SET status='revoked',version=version+1
       WHERE enterprise_account_id=$1 AND user_id=$2 AND role=$3 RETURNING version`,
      [command.scopeId, userId, command.role],
    )
  ).rows[0]!;
  return { status: "revoked", version: changed.version };
}

async function mutateOrganizationUserAssignment(
  sql: Sql,
  command: ScopedRoleCommand,
  now: number,
): Promise<AssignmentResult> {
  const userId = command.principal.id;
  const scope = (
    await sql.query("SELECT status FROM identity_access_organization_scopes WHERE account_id=$1", [
      command.scopeId,
    ])
  ).rows[0];
  if (!scope) throw new GovernanceAccessError(404, "not-found", "找不到角色範圍。");
  if (scope.status !== "active")
    throw new GovernanceAccessError(409, "inactive", "停用的範圍不能變更角色。");
  const membership = (
    await sql.query(
      `SELECT membership_status AS status,membership_version AS version
       FROM identity_access_organization_subjects
       WHERE organization_account_id=$1 AND user_id=$2`,
      [command.scopeId, userId],
    )
  ).rows[0];
  const assignment = (
    await sql.query(
      `SELECT status,version,user_status_version,membership_version FROM organization_role_assignments
       WHERE organization_account_id=$1 AND user_id=$2 AND role=$3 FOR UPDATE`,
      [command.scopeId, userId, command.role],
    )
  ).rows[0];
  if (command.action === "grant") {
    if (!membership || membership.status !== "active")
      throw new GovernanceAccessError(403, "forbidden", "Organization role 對象必須是有效成員。");
    const target = await requireActiveTargetUser(sql, userId);
    if (
      (!assignment && command.expectedVersion !== 0) ||
      (assignment && assignment.version !== command.expectedVersion)
    ) {
      throw new GovernanceAccessError(409, "conflict", "角色指派版本已更新。");
    }
    if (
      assignment?.status === "active" &&
      assignment.user_status_version === target.userStatusVersion &&
      assignment.membership_version === membership.version
    ) {
      throw new GovernanceAccessError(409, "invalid-transition", "角色已生效。");
    }
    if (assignment) {
      const changed = (
        await sql.query(
          `UPDATE organization_role_assignments SET status='active',version=version+1,
             user_status_version=$4,membership_version=$5,granted_at=$6
           WHERE organization_account_id=$1 AND user_id=$2 AND role=$3 RETURNING version`,
          [
            command.scopeId,
            userId,
            command.role,
            target.userStatusVersion,
            membership.version,
            now,
          ],
        )
      ).rows[0]!;
      return { status: "active", version: changed.version };
    }
    await sql.query(
      `INSERT INTO organization_role_assignments(
         organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at
       ) VALUES($1,$2,$3,'active',1,$4,$5,$6)`,
      [command.scopeId, userId, command.role, target.userStatusVersion, membership.version, now],
    );
    return { status: "active", version: 1 };
  }
  if (!assignment) throw new GovernanceAccessError(404, "not-found", "找不到角色指派。");
  if (assignment.version !== command.expectedVersion)
    throw new GovernanceAccessError(409, "conflict", "角色指派版本已更新。");
  if (assignment.status !== "active")
    throw new GovernanceAccessError(409, "invalid-transition", "角色已撤銷。");
  if (
    (await isOrganizationOwner(sql, command.scopeId, userId)) &&
    !(await hasReplacementOrganizationOwner(sql, command.scopeId, userId))
  ) {
    throw new GovernanceAccessError(
      409,
      "last-effective-role-holder",
      "不能撤銷最後一位有效 OrganizationOwner。",
    );
  }
  const changed = (
    await sql.query(
      `UPDATE organization_role_assignments SET status='revoked',version=version+1
       WHERE organization_account_id=$1 AND user_id=$2 AND role=$3 RETURNING version`,
      [command.scopeId, userId, command.role],
    )
  ).rows[0]!;
  return { status: "revoked", version: changed.version };
}

export class PostgresRoleAssignments implements RoleAssignmentPort {
  constructor(private readonly db: Database = businessDatabase()) {}

  execute(
    actor: VerifiedLineActor,
    command: ScopedRoleCommand,
    now: number,
  ): Promise<GovernanceReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const actorPrincipal = await resolveVerifiedLineActor(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${actorPrincipal.userId}:${command.requestId}`,
      ]);
      if (command.scopeKind === "enterprise") {
        await requireEnterpriseOwner(sql, command.scopeId, actorPrincipal.userId);
      } else if (command.scopeKind === "organization") {
        await requireOrganizationOwner(sql, command.scopeId, actorPrincipal.userId);
      } else if (!(await isTeamMaintainer(sql, command.scopeId, actorPrincipal.userId))) {
        throw new GovernanceAccessError(
          403,
          "forbidden",
          "你沒有此 Organization Team 的維護權限。",
        );
      }
      const fingerprint = governanceFingerprint(command);
      const replay = await readGovernanceReplay(
        sql,
        actorPrincipal.userId,
        command.requestId,
        fingerprint,
      );
      if (replay) return replay;

      let changed: AssignmentResult;
      if (command.scopeKind === "enterprise") {
        changed = await mutateEnterpriseUserAssignment(sql, command, now);
      } else if (command.scopeKind === "organization") {
        changed = await mutateOrganizationUserAssignment(sql, command, now);
      } else {
        const userId = command.principal.id;
        const current = (
          await sql.query(
            `SELECT status,version,user_status_version FROM team_role_assignments
             WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' FOR UPDATE`,
            [command.scopeId, userId],
          )
        ).rows[0];
        if (
          (!current && command.expectedVersion !== 0) ||
          (current && current.version !== command.expectedVersion)
        ) {
          throw new GovernanceAccessError(409, "conflict", "TeamMaintainer 指派版本已更新。");
        }
        if (command.action === "grant") {
          if (
            current?.status === "active" &&
            (await isTeamMaintainer(sql, command.scopeId, userId))
          ) {
            throw new GovernanceAccessError(409, "invalid-transition", "TeamMaintainer 已生效。");
          }
          const target = await requireActiveTargetUser(sql, userId);
          await grantTeamMaintainer(sql, {
            teamId: command.scopeId,
            targetUserId: userId,
            userStatusVersion: target.userStatusVersion,
            now,
          });
        } else {
          if (!current)
            throw new GovernanceAccessError(404, "not-found", "找不到 TeamMaintainer 指派。");
          await revokeTeamMaintainer(sql, {
            teamId: command.scopeId,
            targetUserId: userId,
            userStatusVersion: current.user_status_version,
            now,
          });
        }
        const row = (
          await sql.query(
            `SELECT status,version FROM team_role_assignments
             WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer'`,
            [command.scopeId, userId],
          )
        ).rows[0]!;
        changed = { status: row.status, version: row.version };
      }
      const result: GovernanceReceipt = {
        requestId: command.requestId,
        action: `${command.action}-${command.role}`,
        scopeId: command.scopeId,
        subjectKind: command.principal.kind,
        subjectId: command.principal.id,
        status: changed.status,
        version: changed.version,
        at: now,
      };
      await recordGovernanceResult(sql, {
        actorUserId: actorPrincipal.userId,
        actorStatusVersion: actorPrincipal.userStatusVersion,
        requestId: command.requestId,
        fingerprint,
        action: result.action,
        scopeKind: command.scopeKind,
        scopeId: command.scopeId,
        subjectKind: command.principal.kind,
        subjectId: command.principal.id,
        reason: command.reason,
        at: now,
        result,
      });
      return result;
    });
  }
}
