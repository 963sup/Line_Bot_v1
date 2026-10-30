import type { ContentPlanReferenceReader } from "@line_bot_v1/content/contracts/output/plan-references";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { PostgresContracts } from "../../adapters/outbound/persistence/contracts.js";
import { createContracts } from "../../application/use-cases/contracts.js";

export function createPostgresContracts(
  config: Readonly<{
    contentReader: (sql: Sql) => ContentPlanReferenceReader;
    db?: Database;
    now?: () => number;
  }>,
) {
  const persistence = new PostgresContracts(
    config.contentReader,
    config.db ?? businessDatabase(),
  );
  return createContracts({
    reads: persistence,
    transactions: persistence,
    now: config.now ?? Date.now,
  });
}
