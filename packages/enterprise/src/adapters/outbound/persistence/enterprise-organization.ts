import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  hasOrganizationOwnerAssignment,
  isOrganizationOwner,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
} from "@line_bot_v1/identity-access/postgres";
import { readOrganizationQualification } from "@line_bot_v1/organization/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import type {
  EnterpriseMutationEvidence,
  EnterpriseReceipt,
} from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseOrganizationTransaction,
  EnterpriseOrganizationTransactions,
} from "../../../contracts/output/enterprise-organization.js";
import { enterpriseGovernanceTransaction } from "./enterprise-governance-transaction.js";

export class PostgresEnterpriseOrganization implements EnterpriseOrganizationTransactions {
  constructor(private readonly db: Database) {}
  transact(
    actor: VerifiedLineActor,
    scope: { enterpriseAccountId: string; organizationAccountId: string },
    audit: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseOrganizationTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    const scopeId = scope.enterpriseAccountId;
    const at = audit.at;
    return enterpriseGovernanceTransaction(
      this.db,
      actor,
      scopeId,
      audit,
      async (sql, evidence, enterprise) => {
        const organization = await readOrganizationQualification(
          sql,
          scope.organizationAccountId,
          "update",
        );
        if (!organization)
          throw new GovernanceAccessError(404, "not-found", "找不到 Organization。");
        const parameters = [scopeId, scope.organizationAccountId];
        return operation({
          enterprise,
          organization,
          replay: evidence.replay,
          record: evidence.record,
          authorizeEnterprise: (mode) =>
            mode === "active-scope"
              ? requireEnterpriseOwner(sql, scopeId, evidence.actorUserId)
              : requireEnterpriseLifecycleOwner(sql, scopeId, evidence.actorUserId),
          organizationOwnerConsents: (mode) =>
            mode === "active-scope"
              ? isOrganizationOwner(sql, scope.organizationAccountId, evidence.actorUserId)
              : hasOrganizationOwnerAssignment(
                  sql,
                  scope.organizationAccountId,
                  evidence.actorUserId,
                ),
          load: async () =>
            (
              await sql.query(
                `SELECT status,version FROM enterprise_organizations
             WHERE enterprise_account_id=$1 AND organization_account_id=$2 FOR UPDATE`,
                parameters,
                (row) => ({
                  status: literalValue(row.status, ["active", "detached"]),
                  version: numberValue(row.version),
                }),
              )
            ).rows[0] ?? null,
          hasTeamAssignments: async () =>
            Boolean(
              (
                await sql.query(
                  `SELECT 1 FROM enterprise_team_organizations
               WHERE enterprise_account_id=$1 AND organization_account_id=$2 AND status='active'
               LIMIT 1`,
                  parameters,
                )
              ).rows[0],
            ),
          save: async (next) => {
            try {
              if (next.version === 1) {
                await sql.query(
                  `INSERT INTO enterprise_organizations(
                   enterprise_account_id,organization_account_id,status,version,attached_at
                 ) VALUES($1,$2,'active',1,$3)`,
                  [...parameters, at],
                );
                return 1;
              }
              const query =
                next.status === "active"
                  ? `UPDATE enterprise_organizations
                   SET status='active',version=version+1,detached_at=null
                   WHERE enterprise_account_id=$1 AND organization_account_id=$2 RETURNING version`
                  : `UPDATE enterprise_organizations
               SET status='detached',version=version+1,detached_at=$3
               WHERE enterprise_account_id=$1 AND organization_account_id=$2 RETURNING version`;
              const row = (
                await sql.query(
                  query,
                  next.status === "active" ? parameters : [...parameters, at],
                  (row) => ({ version: numberValue(row.version) }),
                )
              ).rows[0];
              if (!row)
                throw new GovernanceAccessError(
                  409,
                  "conflict",
                  "Enterprise 狀態已更新，請重新讀取。",
                );
              return row.version;
            } catch (error) {
              if (
                error instanceof Error &&
                "code" in error &&
                error.code === "23505" &&
                next.status === "active"
              )
                throw new GovernanceAccessError(
                  409,
                  "scope-conflict",
                  "Organization 已由其他 Enterprise 治理。",
                );
              throw error;
            }
          },
        });
      },
    );
  }
}
