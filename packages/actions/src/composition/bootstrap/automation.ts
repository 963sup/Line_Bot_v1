import type { Database } from "@line_bot_v1/platform/postgres";
import { createPostgresWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/baseline-events";
import { PostgresActionStore } from "../../adapters/outbound/persistence/automation.js";
import type { ActionStore } from "../../contracts/repositories/automation.js";
export function createPostgresActionStore(db: Database): ActionStore {
  return new PostgresActionStore(db, (sql) =>
    createPostgresWbsBaselineEvents({ transaction: async (work) => work(sql) }),
  );
}
