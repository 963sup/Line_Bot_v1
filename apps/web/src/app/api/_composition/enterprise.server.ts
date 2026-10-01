import { enterpriseGovernance } from "@line_bot_v1/enterprise/application/enterprise-governance";
import { PostgresEnterpriseGovernance } from "@line_bot_v1/enterprise/postgres";

export function enterpriseService() {
  return enterpriseGovernance(new PostgresEnterpriseGovernance());
}
