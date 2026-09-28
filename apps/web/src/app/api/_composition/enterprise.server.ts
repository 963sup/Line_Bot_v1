import { PostgresEnterpriseGovernance } from "@line_bot_v1/enterprise/adapters/postgres";
import { enterpriseGovernance } from "@line_bot_v1/enterprise/application/enterprise-governance";
import { manageRoleAssignments } from "@line_bot_v1/identity-access/application/manage-role-assignments";
import { PostgresRoleAssignments } from "@line_bot_v1/identity-access/postgres";

export function enterpriseService() {
  return enterpriseGovernance(new PostgresEnterpriseGovernance());
}
export function enterpriseRoles() {
  return manageRoleAssignments(new PostgresRoleAssignments());
}
