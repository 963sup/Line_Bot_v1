import { createObjects } from "@line_bot_v1/object/application/use-cases/objects";
import { createPostgresObjectDependencies } from "@line_bot_v1/object/composition/bootstrap/objects";
import { businessDatabase } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ObjectWebRuntime } from "../../../modules/object/object-http.server";
import { activeLineUser } from "./account.server";

let dependencies: ReturnType<typeof createPostgresObjectDependencies> | undefined;
const objectDependencies = () => (dependencies ??= createPostgresObjectDependencies());

export const objects: ObjectWebRuntime = {
  async scope(subject, selector) {
    const actor = await activeLineUser(subject);
    const { repository, archived } = await businessDatabase().transaction((sql) =>
      repositoryContentScope(sql, actor.id, selector),
    );
    const permissions = repository.permissions;
    return {
      actorUserId: actor.id,
      repository: { id: repository.id, ownerLogin: selector.ownerLogin, name: repository.name },
      archived,
      canEdit:
        !archived &&
        permissions.some((permission) => ["write", "maintain", "admin"].includes(permission)),
      canManageTypes: !archived && permissions.includes("admin"),
      canManageRepository: permissions.includes("admin"),
    };
  },
  objects: () => createObjects({ ...objectDependencies(), now: Date.now }),
};
