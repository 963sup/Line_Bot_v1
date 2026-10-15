import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  governanceFingerprint,
  readGovernanceReplay,
  recordGovernanceResult,
  requireEnterpriseOwner,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import type { EnterpriseReceipt } from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseOwnerCommand,
  EnterpriseOwnerTransaction,
  EnterpriseOwnerTransactions,
} from "../../../contracts/output/enterprise-owner.js";
import {
  hasEnterpriseOwnerAssignment,
  hasReplacementEnterpriseOwner,
} from "../../postgres-owner-roles.js";

export class PostgresEnterpriseOwner implements EnterpriseOwnerTransactions {
  constructor(private readonly db: Database) {}

  transact(
    actor: VerifiedLineActor,
    command: EnterpriseOwnerCommand,
    at: number,
    operation: (transaction: EnterpriseOwnerTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      const principal = await resolveVerifiedLineActor(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${principal.userId}:${command.requestId}`,
      ]);
      const fingerprint = governanceFingerprint(command);
      const enterprise = (
        await sql.query(
          "SELECT account_id,name,slug,status,version FROM enterprises WHERE account_id=$1 FOR UPDATE",
          [command.enterpriseAccountId],
          (row) => ({ status: literalValue(row.status, ["active", "inactive"]) }),
        )
      ).rows[0];
      if (!enterprise) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise。");
      const parameters = [command.enterpriseAccountId, command.targetUserId];
      return operation({
        enterpriseStatus: enterprise.status,
        authorize: () => requireEnterpriseOwner(sql, command.enterpriseAccountId, principal.userId),
        replay: () => readGovernanceReplay(sql, principal.userId, command.requestId, fingerprint),
        hasDirectAffiliation: async () =>
          Boolean(
            (
              await sql.query(
                `SELECT 1 FROM enterprise_direct_affiliations
       WHERE enterprise_account_id=$1 AND user_id=$2 AND status='active'`,
                parameters,
              )
            ).rows[0],
          ),
        activeUserVersion: async () =>
          (await readActiveUserQualification(sql, command.targetUserId, "share"))?.statusVersion ??
          null,
        load: async () =>
          (
            await sql.query(
              `SELECT status,version,user_status_version FROM enterprise_role_assignments
      WHERE enterprise_account_id=$1 AND user_id=$2 AND role='EnterpriseOwner' FOR UPDATE`,
              parameters,
              (row) => ({
                status: literalValue(row.status, ["active", "revoked"]),
                version: numberValue(row.version),
                userStatusVersion: numberValue(row.user_status_version),
              }),
            )
          ).rows[0] ?? null,
        isEffectiveOwner: () =>
          hasEnterpriseOwnerAssignment(sql, command.enterpriseAccountId, command.targetUserId),
        hasReplacementOwner: () =>
          hasReplacementEnterpriseOwner(sql, command.enterpriseAccountId, command.targetUserId),
        save: async (next) => {
          if (next.version === 1) {
            await sql.query(
              `INSERT INTO enterprise_role_assignments(
         enterprise_account_id,user_id,role,status,version,user_status_version,granted_at
       ) VALUES($1,$2,'EnterpriseOwner','active',1,$3,$4)`,
              [...parameters, next.userStatusVersion, at],
            );
            return { status: "active", version: 1 };
          }
          const query =
            next.status === "active"
              ? `UPDATE enterprise_role_assignments
           SET status='active',version=version+1,user_status_version=$3,granted_at=$4
           WHERE enterprise_account_id=$1 AND user_id=$2 AND role='EnterpriseOwner'
          RETURNING version`
              : `UPDATE enterprise_role_assignments SET status='revoked',version=version+1
       WHERE enterprise_account_id=$1 AND user_id=$2 AND role='EnterpriseOwner'
       RETURNING version`;
          const row = (
            await sql.query(
              query,
              next.status === "active" ? [...parameters, next.userStatusVersion, at] : parameters,
              (row) => ({ version: numberValue(row.version) }),
            )
          ).rows[0];
          if (!row)
            throw new GovernanceAccessError(409, "conflict", "EnterpriseOwner 指派已更新。");
          return { status: next.status, version: row.version };
        },
        record: (result) =>
          recordGovernanceResult(sql, {
            actorUserId: principal.userId,
            actorStatusVersion: principal.userStatusVersion,
            requestId: command.requestId,
            fingerprint,
            action: command.action,
            scopeKind: "enterprise",
            scopeId: command.enterpriseAccountId,
            subjectKind: result.subjectKind,
            subjectId: result.subjectId,
            reason: command.reason,
            at,
            result,
          }),
      });
    });
  }
}
