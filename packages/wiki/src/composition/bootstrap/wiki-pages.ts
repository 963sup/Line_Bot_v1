import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWikiStore } from "../../adapters/outbound/persistence/wiki-pages.js";
import type { WikiStore } from "../../contracts/repositories/wiki-pages.js";

export function createPostgresWikiStore(db?: Database): WikiStore {
  return new PostgresWikiStore(db);
}
