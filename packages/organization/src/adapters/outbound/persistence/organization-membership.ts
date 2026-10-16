import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  requireActiveTargetUser,
  requireOrganizationOwner,
} from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import type {
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../../../contracts/organization-governance.js";
import type {
  OrganizationMembershipTransaction,
  OrganizationMembershipTransactions,
} from "../../../contracts/output/organization-membership.js";
import {
  assertOrganizationMembershipSourceRemovable,
  refreshOrganizationMembershipFromSources,
} from "../../../postgres/membership-sources.js";
import { organizationGovernanceTransaction } from "./organization-governance-transaction.js";

export class PostgresOrganizationMembership implements OrganizationMembershipTransactions {
  constructor(private readonly db: Database) {}
  transact(
    actor: VerifiedLineActor,
    scope: { organizationAccountId: string; targetUserId: string | null },
    mutation: OrganizationMutationEvidence,
    operation: (transaction: OrganizationMembershipTransaction) => Promise<OrganizationReceipt>,
  ) {
    return organizationGovernanceTransaction(
      this.db,
      actor,
      scope.organizationAccountId,
      mutation,
      async (sql, evidence, organization) => {
        const targetUserId = scope.targetUserId ?? evidence.actorUserId;
        const values = [scope.organizationAccountId, targetUserId];
        const identity = {
          organizationAccountId: scope.organizationAccountId,
          userId: targetUserId,
        };
        const writeVersion = async (query: string, parameters: unknown[]) => {
          const row = (
            await sql.query(query, parameters, (row) => ({ version: numberValue(row.version) }))
          ).rows[0];
          if (!row)
            throw new GovernanceAccessError(
              409,
              "conflict",
              "Organization 狀態已更新，請重新讀取。",
            );
          return row.version;
        };
        return operation({
          actorUserId: evidence.actorUserId,
          targetUserId,
          organizationStatus: organization.status,
          authorizeOwner: () =>
            requireOrganizationOwner(sql, scope.organizationAccountId, evidence.actorUserId),
          replay: evidence.replay,
          record: evidence.record,
          membershipActive: async () =>
            (
              await sql.query(
                `SELECT status,version FROM organization_memberships WHERE organization_account_id=$1 AND user_id=$2 FOR UPDATE`,
                values,
                (row) => ({
                  status: literalValue(row.status, ["active", "removed"]),
                  version: numberValue(row.version),
                }),
              )
            ).rows[0]?.status === "active",
          directMembership: async () =>
            (
              await sql.query(
                `SELECT status,version FROM organization_direct_memberships WHERE organization_account_id=$1 AND user_id=$2 FOR UPDATE`,
                values,
                (row) => ({
                  ...identity,
                  status: literalValue(row.status, ["active", "removed"]),
                  version: numberValue(row.version),
                }),
              )
            ).rows[0] ?? null,
          invitation: async () =>
            (
              await sql.query(
                `SELECT status,version FROM organization_invitations WHERE organization_account_id=$1 AND user_id=$2 FOR UPDATE`,
                values,
                (row) => ({
                  ...identity,
                  status: literalValue(row.status, [
                    "pending",
                    "accepted",
                    "cancelled",
                    "declined",
                  ]),
                  version: numberValue(row.version),
                }),
              )
            ).rows[0] ?? null,
          requireActiveTarget: async () => {
            await requireActiveTargetUser(sql, targetUserId);
          },
          hasOtherSource: async () =>
            (
              await sql.query(
                `SELECT 1 FROM organization_membership_sources WHERE organization_account_id=$1 AND user_id=$2 AND source_kind<>'direct' LIMIT 1`,
                values,
              )
            ).rows.length > 0,
          assertDirectSourceRemovable: () =>
            assertOrganizationMembershipSourceRemovable(
              sql,
              scope.organizationAccountId,
              targetUserId,
              "direct",
              scope.organizationAccountId,
            ),
          saveDirect: (next) => {
            if (next.version === 1)
              return writeVersion(
                `INSERT INTO organization_direct_memberships(organization_account_id,user_id,status,version,created_at) VALUES($1,$2,'active',1,$3) RETURNING version`,
                [...values, mutation.at],
              );
            return next.status === "active"
              ? writeVersion(
                  `UPDATE organization_direct_memberships SET status='active',version=version+1,created_at=$3 WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                  [...values, mutation.at],
                )
              : writeVersion(
                  `UPDATE organization_direct_memberships SET status='removed',version=version+1 WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                  values,
                );
          },
          saveInvitation: (next) => {
            if (next.version === 1)
              return writeVersion(
                `INSERT INTO organization_invitations(organization_account_id,user_id,status,version,created_at,resolved_at) VALUES($1,$2,'pending',1,$3,null) RETURNING version`,
                [...values, mutation.at],
              );
            return next.status === "pending"
              ? writeVersion(
                  `UPDATE organization_invitations SET status='pending',version=version+1,created_at=$3,resolved_at=null WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                  [...values, mutation.at],
                )
              : writeVersion(
                  `UPDATE organization_invitations SET status=$3,version=version+1,resolved_at=$4 WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                  [...values, next.status, mutation.at],
                );
          },
          refreshMembership: async () => {
            await refreshOrganizationMembershipFromSources(
              sql,
              scope.organizationAccountId,
              targetUserId,
              mutation.at,
            );
          },
        });
      },
    );
  }
}
