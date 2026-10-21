import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresResourceReferenceReader } from "../../adapters/outbound/persistence/resource-references.js";
import type { ResourceReferenceReader } from "../../contracts/output/resource-references.js";

export function createPostgresResourceReferenceReader(sql: Sql): ResourceReferenceReader {
  return new PostgresResourceReferenceReader(sql);
}
