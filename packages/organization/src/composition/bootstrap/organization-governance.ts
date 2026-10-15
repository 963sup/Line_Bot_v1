import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresOrganizationLifecycle } from "../../adapters/outbound/persistence/organization-lifecycle.js";
import { organizationGovernance } from "../../application/organization-governance.js";
import { PostgresOrganizationGovernance } from "../../postgres.js";

export function createPostgresOrganizationGovernance(db: Database, clock = Date.now) {
  return organizationGovernance(
    new PostgresOrganizationGovernance(db),
    new PostgresOrganizationLifecycle(db),
    clock,
  );
}
