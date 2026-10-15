import { businessDatabase } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { createWikiHistory } from "@line_bot_v1/wiki/application/use-cases/history";
import { createWiki } from "@line_bot_v1/wiki/application/use-cases/pages";
import { createPostgresWikiDependencies } from "@line_bot_v1/wiki/composition/bootstrap/wiki-pages";
import { canEditWiki } from "@line_bot_v1/wiki/domain/policies/wiki-access";
import type { WikiWebRuntime } from "../../../modules/repository/wiki-http.server";
import { activeLineUser } from "./account.server";

let store: ReturnType<typeof createPostgresWikiDependencies> | undefined;
const wikiStore = () => (store ??= createPostgresWikiDependencies());
export const wiki: WikiWebRuntime = {
  async scope(subject, selector) {
    const actor = await activeLineUser(subject);
    const { repository, archived } = await businessDatabase().transaction((sql) =>
      repositoryContentScope(sql, actor.id, selector),
    );
    return {
      actorUserId: actor.id,
      repository: { id: repository.id, ownerLogin: selector.ownerLogin, name: repository.name },
      archived,
      canEdit: !archived && canEditWiki(repository.permissions),
      canManageRepository: repository.permissions.includes("admin"),
    };
  },
  pages: () => createWiki({ ...wikiStore(), now: Date.now }),
  history: () => createWikiHistory(wikiStore().reads),
};
