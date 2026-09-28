import { manageRoleAssignments } from "@line_bot_v1/identity-access/application/manage-role-assignments";
import { PostgresRoleAssignments } from "@line_bot_v1/identity-access/postgres";
import { organizationGovernance } from "@line_bot_v1/organization/application/organization-governance";
import { PostgresOrganizationGovernance } from "@line_bot_v1/organization/postgres";

export function organizationService() {
  return organizationGovernance(new PostgresOrganizationGovernance());
}
export function organizationRoles() {
  return manageRoleAssignments(new PostgresRoleAssignments());
}
