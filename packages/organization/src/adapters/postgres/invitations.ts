import type { Sql } from "@line-work/platform/adapters/postgres";

export async function cancelPendingOrganizationInvitation(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
  at: number,
) {
  await sql.query(
    `UPDATE organization_invitations
     SET status='cancelled',version=version+1,resolved_at=$3
     WHERE organization_account_id=$1 AND user_id=$2 AND status='pending'`,
    [organizationAccountId, userId, at],
  );
}
