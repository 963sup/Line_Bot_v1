import { PostgresRoleAssignments } from "@line-work/identity-access/adapters/postgres";
import { manageRoleAssignments } from "@line-work/identity-access/application/manage-role-assignments";
import { PostgresOrganizationGovernance } from "@line-work/organization/adapters/postgres";
import { organizationGovernance } from "@line-work/organization/application/organization-governance";

export function organizationService() {
  return organizationGovernance(new PostgresOrganizationGovernance());
}
export function organizationRoles() {
  return manageRoleAssignments(new PostgresRoleAssignments());
}
