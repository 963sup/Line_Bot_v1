import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue } from "@line_bot_v1/platform/validation";
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
) {
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
  if (hasOtherSource) return;
  if (
    (await hasOrganizationOwnerAssignment(sql, organizationAccountId, userId)) &&
    !(await hasReplacementOrganizationOwner(sql, organizationAccountId, userId))
  ) {
    throw new GovernanceAccessError(
      409,
      "last-effective-role-holder",
      "不能移除最後一位有效 OrganizationOwner 的最後 membership source。",
    );
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
