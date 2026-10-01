import { organizationGovernance } from "@line_bot_v1/organization/application/organization-governance";
import { PostgresOrganizationGovernance } from "@line_bot_v1/organization/postgres";

export function organizationService() {
  return organizationGovernance(new PostgresOrganizationGovernance());
}
