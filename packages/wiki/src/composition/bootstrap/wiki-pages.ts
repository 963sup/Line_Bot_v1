import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWikiPages } from "../../adapters/outbound/persistence/wiki-pages.js";
import type { WikiReads, WikiTransactions } from "../../contracts/output/wiki-pages.js";

export function createPostgresWikiDependencies(db?: Database): {
  reads: WikiReads;
  transactions: WikiTransactions;
} {
  const persistence = new PostgresWikiPages(db);
  return { reads: persistence, transactions: persistence };
}
