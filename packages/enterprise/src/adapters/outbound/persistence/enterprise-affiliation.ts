import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  requireActiveTargetUser,
  requireEnterpriseOwner,
} from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import type {
  EnterpriseMutationEvidence,
  EnterpriseReceipt,
} from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseAffiliationTransaction,
  EnterpriseAffiliationTransactions,
} from "../../../contracts/output/enterprise-affiliation.js";
import {
  hasEnterpriseOwnerAssignment,
  hasReplacementEnterpriseOwner,
  revokeEnterpriseOwnerForAffiliationRemoval,
} from "../../postgres-owner-roles.js";
import { enterpriseGovernanceTransaction } from "./enterprise-governance-transaction.js";

export class PostgresEnterpriseAffiliation implements EnterpriseAffiliationTransactions {
  constructor(private readonly db: Database) {}

  transact(
    actor: VerifiedLineActor,
    scope: { enterpriseAccountId: string; targetUserId: string | null },
    audit: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseAffiliationTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    const scopeId = scope.enterpriseAccountId;
    const at = audit.at;
    return enterpriseGovernanceTransaction(this.db, actor, scopeId, audit, (sql, evidence) => {
      const targetUserId = scope.targetUserId ?? evidence.actorUserId;
      const parameters = [scopeId, targetUserId];
      async function versionWrite(text: string, values: unknown[]) {
        const row = (
          await sql.query(text, values, (row) => ({ version: numberValue(row.version) }))
        ).rows[0];
        if (!row)
          throw new GovernanceAccessError(409, "conflict", "Enterprise 狀態已更新，請重新讀取。");
        return row.version;
      }
      return operation({
        ...evidence,
        targetUserId,
        authorizeOwner: () => requireEnterpriseOwner(sql, scopeId, evidence.actorUserId),
        loadDirect: async () =>
          (
            await sql.query(
              `SELECT status,version FROM enterprise_direct_affiliations
             WHERE enterprise_account_id=$1 AND user_id=$2 FOR UPDATE`,
              parameters,
              (row) => ({
                status: literalValue(row.status, ["active", "removed"]),
                version: numberValue(row.version),
              }),
            )
          ).rows[0] ?? null,
        loadInvitation: async () =>
          (
            await sql.query(
              `SELECT status,version FROM enterprise_invitations
             WHERE enterprise_account_id=$1 AND user_id=$2 FOR UPDATE`,
              parameters,
              (row) => ({
                status: literalValue(row.status, ["pending", "accepted", "declined", "cancelled"]),
                version: numberValue(row.version),
              }),
            )
          ).rows[0] ?? null,
        hasEffectiveAffiliation: async () =>
          Boolean(
            (
              await sql.query(
                `SELECT 1 FROM enterprise_user_affiliations
         WHERE enterprise_account_id=$1 AND user_id=$2 LIMIT 1`,
                parameters,
              )
            ).rows[0],
          ),
        requireActiveTarget: () => requireActiveTargetUser(sql, targetUserId).then(() => undefined),
        hasOtherAffiliation: async () =>
          Boolean(
            (
              await sql.query(
                `SELECT 1 FROM enterprise_user_affiliations
                 WHERE enterprise_account_id=$1 AND user_id=$2 AND source_kind<>'direct'
                 LIMIT 1`,
                parameters,
              )
            ).rows[0],
          ),
        isEffectiveOwner: () => hasEnterpriseOwnerAssignment(sql, scopeId, targetUserId),
        hasReplacementOwner: () => hasReplacementEnterpriseOwner(sql, scopeId, targetUserId),
        revokeOwner: () => revokeEnterpriseOwnerForAffiliationRemoval(sql, scopeId, targetUserId),
        saveDirect: async (next) => {
          if (next.status === "removed")
            return versionWrite(
              `UPDATE enterprise_direct_affiliations SET status='removed',version=version+1
               WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
              parameters,
            );
          if (next.version === 1)
            await sql.query(
              `INSERT INTO enterprise_direct_affiliations(
                 enterprise_account_id,user_id,status,version,created_at
               ) VALUES($1,$2,'active',1,$3)`,
              [...parameters, at],
            );
          else
            await sql.query(
              `UPDATE enterprise_direct_affiliations
               SET status='active',version=version+1,created_at=$3
               WHERE enterprise_account_id=$1 AND user_id=$2`,
              [...parameters, at],
            );
          return next.version;
        },
        saveInvitation: async (next) => {
          if (next.version === 1) {
            await sql.query(
              `INSERT INTO enterprise_invitations(
                 enterprise_account_id,user_id,status,version,created_at,resolved_at
               ) VALUES($1,$2,'pending',1,$3,null)`,
              [...parameters, at],
            );
            return 1;
          }
          if (next.status === "pending")
            return versionWrite(
              `UPDATE enterprise_invitations
                 SET status='pending',version=version+1,created_at=$3,resolved_at=null
                 WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
              [...parameters, at],
            );
          return versionWrite(
            `UPDATE enterprise_invitations
               SET status=$3,version=version+1,resolved_at=$4
               WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
            [...parameters, next.status, at],
          );
        },
      });
    });
  }
}
