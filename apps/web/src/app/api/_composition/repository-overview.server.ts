import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { createRepositoryOverviewReader } from "@line_bot_v1/repository/application/overview";
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { createLegacyWbsEntry } from "@line_bot_v1/wbs/application/use-cases/legacy-entry";
import { createPostgresLegacyWbsEntryQuery } from "@line_bot_v1/wbs/composition/bootstrap/legacy-entry";
import { activeLineUser } from "./account.server";

function productionReader(db: Database = businessDatabase()) {
  const legacy = createLegacyWbsEntry({
    activeUser: activeLineUser,
    query: () => createPostgresLegacyWbsEntryQuery(db),
  });
  return createRepositoryOverviewReader({
    activeUser: activeLineUser,
    scope: (userId, selector) =>
      db.transaction((sql) => repositoryContentScope(sql, userId, selector)),
    legacy: (subject, repositoryId) => legacy.read(subject, { repositoryId }),
  });
}

export function readRepositoryOverview(
  subject: string,
  selector: Extract<RepositorySelector, { ownerLogin: string }>,
) {
  return productionReader()(subject, selector);
}
