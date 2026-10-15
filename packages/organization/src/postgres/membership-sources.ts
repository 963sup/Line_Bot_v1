import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
import { OrganizationError, requireOrganizationOwnerAfterSourceRemoval } from "../domain.js";
import {
  hasOrganizationOwnerAssignment,
  hasReplacementOrganizationOwner,
  revokeOrganizationOwnerForMembershipRemoval,
} from "./owner-roles.js";

function refreshedMembershipRow(row: Record<string, unknown>) {
  return {
    membership_status: literalValue(row.membership_status, ["active", "removed"]),
    membership_version: numberValue(row.membership_version),
  };
}

export async function assertOrganizationMembershipSourceRemovable(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
  sourceKind: "direct" | "enterprise-team",
  sourceId: string,
  affectedUserIds: readonly string[] | undefined = undefined,
) {
  // A batch supplies its complete population; single-user removals leave the other users intact.
  const hasOtherSource = Boolean(
    (
      await sql.query(
        `SELECT 1 FROM organization_membership_sources
         WHERE organization_account_id=$1 AND user_id=$2
           AND NOT (source_kind=$3 AND source_id=$4)
         LIMIT 1`,
        [organizationAccountId, userId, sourceKind, sourceId],
      )
    ).rows[0],
  );
  const targetEffective =
    !hasOtherSource && (await hasOrganizationOwnerAssignment(sql, organizationAccountId, userId));
  const anotherEffective =
    targetEffective &&
    (await hasReplacementOrganizationOwner(
      sql,
      organizationAccountId,
      userId,
      affectedUserIds ? { affectedUserIds, sourceKind, sourceId } : undefined,
    ));
  try {
    requireOrganizationOwnerAfterSourceRemoval(hasOtherSource, targetEffective, anotherEffective);
  } catch (error) {
    if (!(error instanceof OrganizationError)) throw error;
    throw new GovernanceAccessError(409, error.code, error.message);
  }
}

export async function refreshOrganizationMembershipFromSources(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
  at: number,
) {
  const row = (
    await sql.query(
      `SELECT membership_status,membership_version
       FROM refresh_organization_membership($1,$2,$3)`,
      [organizationAccountId, userId, at],
      refreshedMembershipRow,
    )
  ).rows[0];
  if (row?.membership_status === "removed") {
    await revokeOrganizationOwnerForMembershipRemoval(sql, organizationAccountId, userId);
  }
  return row;
}
