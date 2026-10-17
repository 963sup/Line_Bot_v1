import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectWbsGovernanceStore } from "../../adapters/outbound/persistence/project-governance.js";
import type { ProjectWbsGovernanceStore } from "../../contracts/repositories/project-governance.js";
export function createPostgresProjectWbsGovernanceStore(db?: Database): ProjectWbsGovernanceStore {
  return new PostgresProjectWbsGovernanceStore(db);
}
