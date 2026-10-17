import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresActionTransferFacts } from "../../adapters/outbound/persistence/transfer-facts.js";
import type { ActionTransferFacts } from "../../contracts/output/transfer-facts.js";

export function createPostgresActionTransferFacts(sql: Sql): ActionTransferFacts {
  return new PostgresActionTransferFacts(sql);
}
