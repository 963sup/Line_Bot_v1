import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import {
  PostgresWbsScopeTransferStore,
  readRepositoryTransferScope,
} from "../../adapters/outbound/persistence/transfer.js";
import type { WbsTransferScopeReaders } from "../../contracts/output/transfer.js";
import type { WbsScopeTransferStore } from "../../contracts/repositories/transfer.js";

export function createPostgresWbsScopeTransferStore(
  requestDb: Database,
  bindReaders: (
    sql: Sql,
  ) => Omit<WbsTransferScopeReaders, "repository"> &
    Partial<Pick<WbsTransferScopeReaders, "repository">>,
  operatorDb?: Database,
): WbsScopeTransferStore {
  return new PostgresWbsScopeTransferStore(
    requestDb,
    (sql) => {
      const readers = bindReaders(sql);
      return {
        repository:
          readers.repository ??
          ((actorUserId, repositoryId) =>
            readRepositoryTransferScope(sql, actorUserId, repositoryId)),
        project: readers.project,
        dependents: readers.dependents,
      };
    },
    operatorDb,
  );
}
