import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWbsGovernanceStore } from "../../adapters/outbound/persistence/governance.js";
import { PostgresWbsStore } from "../../adapters/outbound/persistence/store.js";
import type { WbsStore } from "../../contracts/repositories/content.js";
import type { WbsGovernanceStore } from "../../contracts/repositories/governance.js";

export function createPostgresWbsStore(db?: Database): WbsStore {
  return new PostgresWbsStore(db);
}
export function createPostgresWbsGovernanceStore(db?: Database): WbsGovernanceStore {
  return new PostgresWbsGovernanceStore(db);
}
