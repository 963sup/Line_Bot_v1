import { businessDatabase } from "@line_bot_v1/platform/postgres";
import { hasRepositoryPermission } from "@line_bot_v1/repository/domain/repository/value-objects/repository-capability";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { activeLineUser } from "./account.server";

export async function repositoryOwnerScope(
  subject: string,
  selector: { ownerLogin: string; repositoryName: string },
) {
  const actor = await activeLineUser(subject);
  const { repository, archived } = await businessDatabase().transaction((sql) =>
    repositoryContentScope(sql, actor.id, selector),
  );
  return {
    actorUserId: actor.id,
    repository: { id: repository.id, ownerLogin: selector.ownerLogin, name: repository.name },
    archived,
    canEdit:
      !archived &&
      (hasRepositoryPermission(repository.permissions, "write") ||
        hasRepositoryPermission(repository.permissions, "maintain") ||
        hasRepositoryPermission(repository.permissions, "admin")),
    canManage: !archived && hasRepositoryPermission(repository.permissions, "admin"),
  };
}
