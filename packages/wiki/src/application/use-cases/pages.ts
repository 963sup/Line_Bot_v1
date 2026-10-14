import type { WikiQuery } from "../../contracts/dto/wiki.js";
import type { WikiStore } from "../../contracts/repositories/wiki-pages.js";
import { canEditWiki } from "../../domain/policies/wiki-access.js";
import { WikiError } from "../../domain/wiki-error.js";
import { reviseWikiPage } from "../../domain/wiki-page.js";
import { parseWikiCommand } from "../commands/pages.js";
import { wikiId, wikiQuery } from "../queries/pages.js";

export function createWiki(deps: { store: WikiStore; now(): number }) {
  return {
    list: (userId: string, repositoryId: string, after?: string) =>
      deps.store.list(userId, repositoryId, after === undefined ? undefined : wikiId(after)),
    read: (userId: string, query: WikiQuery) => deps.store.read(userId, wikiQuery(query)),
    async execute(userId: string, input: unknown) {
      const command = parseWikiCommand(input);
      return deps.store.transact(userId, command, async (tx) => {
        if (!canEditWiki(tx.scope.permissions))
          throw new WikiError(403, "Wiki editing requires write, maintain or admin.");
        const replay = await tx.replay();
        if (replay) return replay;
        if (tx.scope.archived) throw new WikiError(409, "Repository is archived.");
        const current = await tx.load();
        const restored =
          command.action === "restore" ? await tx.revision(command.revisionId) : null;
        return tx.save(
          reviseWikiPage(
            current,
            command.expectedVersion,
            command,
            {
              id: tx.nextId(),
              pageId: command.pageId,
              repositoryId: tx.scope.repositoryId,
              actorUserId: userId,
              at: deps.now(),
            },
            restored,
          ),
        );
      });
    },
  };
}
