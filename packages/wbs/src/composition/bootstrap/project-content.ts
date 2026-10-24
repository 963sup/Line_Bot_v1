import { createPostgresContractReferenceReader } from "@line_bot_v1/contract/composition/bootstrap/references";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectWbsStore } from "../../adapters/outbound/persistence/project-content.js";
import type { ProjectWbsStore } from "../../contracts/repositories/project-content.js";
export function createPostgresProjectWbsStore(db?: Database): ProjectWbsStore {
  return new PostgresProjectWbsStore(
    db ?? businessDatabase(),
    createPostgresContractReferenceReader,
  );
}
