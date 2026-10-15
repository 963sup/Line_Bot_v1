import { createPostgresEnterpriseGovernance } from "@line_bot_v1/enterprise/composition/bootstrap/enterprise-governance";
import { businessDatabase } from "@line_bot_v1/platform/postgres";

export function enterpriseService() {
  return createPostgresEnterpriseGovernance(businessDatabase());
}
