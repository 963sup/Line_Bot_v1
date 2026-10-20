import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresContractReferenceReader } from "../../adapters/outbound/persistence/references.js";
import type { ContractReferenceReader } from "../../contracts/output/references.js";

export function createPostgresContractReferenceReader(sql: Sql): ContractReferenceReader {
  return new PostgresContractReferenceReader(sql);
}
