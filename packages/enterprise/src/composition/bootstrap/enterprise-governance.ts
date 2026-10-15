import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresEnterpriseLifecycle } from "../../adapters/outbound/persistence/enterprise-lifecycle.js";
import { PostgresEnterpriseGovernance } from "../../adapters/postgres.js";
import { enterpriseGovernance } from "../../application/enterprise-governance.js";

export function createPostgresEnterpriseGovernance(db: Database, clock = Date.now) {
  return enterpriseGovernance(
    new PostgresEnterpriseGovernance(db),
    new PostgresEnterpriseLifecycle(db),
    clock,
  );
}
