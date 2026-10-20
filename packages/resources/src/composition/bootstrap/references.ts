import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresObjectReferenceReader } from "../../adapters/outbound/persistence/references.js";
import type { ObjectReferenceReader } from "../../contracts/output/references.js";

export function createPostgresObjectReferenceReader(sql: Sql): ObjectReferenceReader {
  return new PostgresObjectReferenceReader(sql);
}
