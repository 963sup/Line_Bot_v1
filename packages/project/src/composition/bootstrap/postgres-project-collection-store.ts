import { businessDatabase } from "@line_bot_v1/platform/postgres";
import { PostgresProjectCollectionStore } from "../../adapters/outbound/persistence/postgres-project-collection-store.js";
import type { ProjectCollectionStore } from "../../contracts/repositories/project-collection-store.js";

export function createPostgresProjectCollectionStore(): ProjectCollectionStore {
  return new PostgresProjectCollectionStore(businessDatabase());
}
