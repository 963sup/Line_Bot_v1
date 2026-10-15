import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { requireOrganizationOwner } from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import type {
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../../../contracts/organization-governance.js";
import type {
  OrganizationOwnerTransaction,
  OrganizationOwnerTransactions,
} from "../../../contracts/output/organization-owner.js";
import {
  hasOrganizationOwnerAssignment,
  hasReplacementOrganizationOwner,
} from "../../../postgres/owner-roles.js";
import { organizationGovernanceTransaction } from "./organization-governance-transaction.js";

export class PostgresOrganizationOwner implements OrganizationOwnerTransactions {
  constructor(private readonly db: Database) {}
  transact(
    actor: VerifiedLineActor,
    scope: { organizationAccountId: string; targetUserId: string },
    mutation: OrganizationMutationEvidence,
    operation: (transaction: OrganizationOwnerTransaction) => Promise<OrganizationReceipt>,
  ) {
    return organizationGovernanceTransaction(
      this.db,
      actor,
      scope.organizationAccountId,
      mutation,
      async (sql, evidence, organization) => {
        const values = [scope.organizationAccountId, scope.targetUserId];
        return operation({
          organization,
          authorize: () =>
            requireOrganizationOwner(sql, scope.organizationAccountId, evidence.actorUserId),
          replay: evidence.replay,
          record: evidence.record,
          membership: async () =>
            (
              await sql.query(
                `SELECT status,version FROM organization_memberships
          WHERE organization_account_id=$1 AND user_id=$2`,
                values,
                (row) => ({
                  status: literalValue(row.status, ["active", "removed"]),
                  version: numberValue(row.version),
                }),
              )
            ).rows[0] ?? null,
          load: async () =>
            (
              await sql.query(
                `SELECT status,version,user_status_version,membership_version
          FROM organization_role_assignments
          WHERE organization_account_id=$1 AND user_id=$2 AND role='OrganizationOwner' FOR UPDATE`,
                values,
                (row) => ({
                  status: literalValue(row.status, ["active", "revoked"]),
                  version: numberValue(row.version),
                  userStatusVersion: numberValue(row.user_status_version),
                  membershipVersion: numberValue(row.membership_version),
                }),
              )
            ).rows[0] ?? null,
          activeTargetVersion: async () =>
            (await readActiveUserQualification(sql, scope.targetUserId, "share"))?.statusVersion ??
            null,
          targetEffective: () =>
            hasOrganizationOwnerAssignment(sql, scope.organizationAccountId, scope.targetUserId),
          anotherEffective: () =>
            hasReplacementOrganizationOwner(sql, scope.organizationAccountId, scope.targetUserId),
          save: async (next) => {
            if (next.version === 1) {
              await sql.query(
                `INSERT INTO organization_role_assignments(
              organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at
            ) VALUES($1,$2,'OrganizationOwner','active',1,$3,$4,$5)`,
                [...values, next.userStatusVersion, next.membershipVersion, mutation.at],
              );
              return 1;
            }
            const query =
              next.status === "active"
                ? `UPDATE organization_role_assignments
               SET status='active',version=version+1,user_status_version=$3,membership_version=$4,granted_at=$5
               WHERE organization_account_id=$1 AND user_id=$2 AND role='OrganizationOwner' RETURNING version`
                : `UPDATE organization_role_assignments SET status='revoked',version=version+1
               WHERE organization_account_id=$1 AND user_id=$2 AND role='OrganizationOwner' RETURNING version`;
            const row = (
              await sql.query(
                query,
                next.status === "active"
                  ? [...values, next.userStatusVersion, next.membershipVersion, mutation.at]
                  : values,
                (row) => ({ version: numberValue(row.version) }),
              )
            ).rows[0];
            if (!row)
              throw new GovernanceAccessError(409, "conflict", "OrganizationOwner 指派已更新。");
            return row.version;
          },
        });
      },
    );
  }
}
