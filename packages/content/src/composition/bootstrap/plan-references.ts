import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresContentPlanReferenceReader } from "../../adapters/outbound/persistence/plan-references.js";
import type { ContentPlanReferenceReader } from "../../contracts/output/plan-references.js";

export function createPostgresContentPlanReferenceReader(sql: Sql): ContentPlanReferenceReader {
  return new PostgresContentPlanReferenceReader(sql);
}
