import { createPostgresContentPlanReferenceReader } from "@line_bot_v1/content/composition/bootstrap/plan-references";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresContracts } from "../../adapters/outbound/persistence/contracts.js";
import { createContracts } from "../../application/use-cases/contracts.js";

export function createPostgresContracts(
  config: Readonly<{ db?: Database; now?: () => number }> = {},
) {
  const persistence = new PostgresContracts(
    createPostgresContentPlanReferenceReader,
    config.db ?? businessDatabase(),
  );
  return createContracts({
    reads: persistence,
    transactions: persistence,
    now: config.now ?? Date.now,
  });
}
