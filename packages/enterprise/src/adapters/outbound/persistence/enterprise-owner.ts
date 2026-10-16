import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { requireEnterpriseOwner } from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import type {
  EnterpriseMutationEvidence,
  EnterpriseReceipt,
} from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseOwnerTransaction,
  EnterpriseOwnerTransactions,
} from "../../../contracts/output/enterprise-owner.js";
import {
  hasEnterpriseOwnerAssignment,
  hasReplacementEnterpriseOwner,
} from "../../postgres-owner-roles.js";
import { enterpriseGovernanceTransaction } from "./enterprise-governance-transaction.js";

export class PostgresEnterpriseOwner implements EnterpriseOwnerTransactions {
  constructor(private readonly db: Database) {}

  transact(
    actor: VerifiedLineActor,
    scope: { enterpriseAccountId: string; targetUserId: string },
    audit: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseOwnerTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    const scopeId = scope.enterpriseAccountId;
    const at = audit.at;
    return enterpriseGovernanceTransaction(this.db, actor, scopeId, audit, (sql, evidence) => {
      const parameters = [scopeId, scope.targetUserId];
      return operation({
        ...evidence,
        authorize: () => requireEnterpriseOwner(sql, scopeId, evidence.actorUserId),
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
          (await readActiveUserQualification(sql, scope.targetUserId, "share"))?.statusVersion ??
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
        isEffectiveOwner: () => hasEnterpriseOwnerAssignment(sql, scopeId, scope.targetUserId),
        hasReplacementOwner: () => hasReplacementEnterpriseOwner(sql, scopeId, scope.targetUserId),
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
      });
    });
  }
}
