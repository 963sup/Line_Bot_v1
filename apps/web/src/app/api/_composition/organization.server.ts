import { createPostgresOrganizationGovernance } from "@line_bot_v1/organization/composition/bootstrap/organization-governance";
import { businessDatabase } from "@line_bot_v1/platform/postgres";

export function organizationService() {
  return createPostgresOrganizationGovernance(businessDatabase());
}
