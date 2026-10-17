import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresWbsScopeBoundary } from "../../adapters/outbound/persistence/scope-boundary.js";
import type { WbsScopeBoundary } from "../../contracts/output/scope-boundary.js";

export function createPostgresWbsScopeBoundary(sql: Sql): WbsScopeBoundary {
  return new PostgresWbsScopeBoundary(sql);
}
