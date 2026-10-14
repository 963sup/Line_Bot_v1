import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWbsGovernanceStore } from "../../adapters/outbound/persistence/governance.js";
import { PostgresWbsStore } from "../../adapters/outbound/persistence/store.js";

export function createPostgresWbsStore(db?: Database) {
  return new PostgresWbsStore(db);
}
export function createPostgresWbsGovernanceStore(db?: Database) {
  return new PostgresWbsGovernanceStore(db);
}
