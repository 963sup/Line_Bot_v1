import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresResourceQuantityReader } from "../../adapters/outbound/persistence/engineering-references.js";
import type { ResourceQuantityReader } from "../../contracts/output/engineering-references.js";

export function createPostgresResourceQuantityReader(sql: Sql): ResourceQuantityReader {
  return new PostgresResourceQuantityReader(sql);
}
