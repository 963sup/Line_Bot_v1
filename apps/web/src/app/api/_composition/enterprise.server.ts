import { PostgresEnterpriseGovernance } from "@line-work/enterprise/adapters/postgres";
import { enterpriseGovernance } from "@line-work/enterprise/application/enterprise-governance";
import { PostgresRoleAssignments } from "@line-work/identity-access/adapters/postgres";
import { manageRoleAssignments } from "@line-work/identity-access/application/manage-role-assignments";

export function enterpriseService() {
  return enterpriseGovernance(new PostgresEnterpriseGovernance());
}
export function enterpriseRoles() {
  return manageRoleAssignments(new PostgresRoleAssignments());
}
