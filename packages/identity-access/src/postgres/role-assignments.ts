import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type { RoleAssignmentPort } from "../application/ports/role-assignments.js";
import type { GovernanceReceipt, VerifiedLineActor } from "../contracts/governance.js";
import type { ScopedRoleCommand } from "../domain/role-assignment.js";
import { GovernanceAccessError } from "../domain/role-assignment.js";
import { requireActiveTargetUser, resolveVerifiedLineActor } from "./actor.js";
import { governanceFingerprint, readGovernanceReplay, recordGovernanceResult } from "./receipts.js";
import {
  grantTeamMaintainer,
  isTeamMaintainer,
  revokeTeamMaintainer,
} from "./typed-role-assignments.js";

type AssignmentResult = { status: "active" | "revoked"; version: number };

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
      if (!(await isTeamMaintainer(sql, command.scopeId, actorPrincipal.userId))) {
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
      {
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
