import { createPostgresActionTransferFacts } from "@line_bot_v1/actions/composition/bootstrap/transfer-facts";
import { createPostgresNotificationTransferFacts } from "@line_bot_v1/notifications/composition/bootstrap/transfer-facts";
import { businessDatabase } from "@line_bot_v1/platform/postgres";
import { createPostgresProjectContentScope } from "@line_bot_v1/project/composition/bootstrap/project-content-scope";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { createPostgresWbsScopeTransferStore } from "@line_bot_v1/wbs/composition/bootstrap/transfer";

let store: ReturnType<typeof createPostgresWbsScopeTransferStore> | undefined;

export function resolveWbsTransferRepository(
  actorUserId: string,
  selector: { ownerLogin: string; repositoryName: string },
) {
  return businessDatabase().transaction(
    async (sql) => (await repositoryContentScope(sql, actorUserId, selector)).repository.id,
  );
}

export function wbsTransferStore() {
  return (store ??= createPostgresWbsScopeTransferStore(businessDatabase(), (sql) => ({
    project: async (userId, projectId) => {
      const scope = await createPostgresProjectContentScope(sql).read(userId, projectId);
      return {
        projectId: scope.project.id,
        ownerAccountId: scope.project.ownerAccountId,
        ownerKind: scope.project.ownerKind,
        role: scope.role,
        public: scope.project.public,
        hasCollaboratorGrants: scope.project.hasCollaboratorGrants,
        closed: scope.closed,
      };
    },
    dependents: async (_actorUserId, _repositoryId, projectId) => {
      const [actionRows, notificationRows] = await Promise.all([
        createPostgresActionTransferFacts(sql).read(projectId),
        createPostgresNotificationTransferFacts(sql).read(),
      ]);
      return { actionRows, notificationRows };
    },
  })));
}
