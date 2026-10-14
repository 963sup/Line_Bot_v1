import { createRepositoryPulse } from "@line_bot_v1/insights/application/use-cases/repository-pulse";
import { createPostgresIssueMetrics } from "@line_bot_v1/issue/composition/bootstrap/metrics";
import { businessDatabase } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { createPostgresWbsMetrics } from "@line_bot_v1/wbs/composition/bootstrap/metrics";
import { activeLineUser } from "./account.server";

export async function readRepositoryPulse(
  subject: string,
  selector: { ownerLogin: string; repositoryName: string },
  period: { from?: number; to?: number },
) {
  const actor = await activeLineUser(subject);
  const db = businessDatabase();
  const scope = await db.transaction((sql) => repositoryContentScope(sql, actor.id, selector));
  const pulse = createRepositoryPulse({
    qualify: async (userId, repositoryId) => {
      await db.transaction((sql) => repositoryContentScope(sql, userId, { repositoryId }));
    },
    issues: createPostgresIssueMetrics(db),
    wbs: createPostgresWbsMetrics(db),
    now: Date.now,
  });
  return {
    ...(await pulse.read(actor.id, { repositoryId: scope.repository.id, ...period })),
    canManageRepository: scope.repository.permissions.includes("admin"),
  };
}
