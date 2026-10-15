import type { WikiReads, WikiTransactions } from "../../contracts/output/wiki-pages.js";
import { canEditWiki } from "../../domain/policies/wiki-access.js";
import { WikiError } from "../../domain/wiki-error.js";
import { reviseWikiPage } from "../../domain/wiki-page.js";
import { parseWikiCommand } from "../commands/pages.js";
import { type WikiQuery, wikiId, wikiQuery } from "../queries/pages.js";
import { wikiRevisionDto } from "./revision-dto.js";

export function createWiki(deps: {
  reads: WikiReads;
  transactions: WikiTransactions;
  now(): number;
}) {
  return {
    list: (userId: string, repositoryId: string, after?: string) =>
      deps.reads.list(userId, repositoryId, after === undefined ? undefined : wikiId(after)),
    read: async (userId: string, query: WikiQuery) =>
      wikiRevisionDto(await deps.reads.read(userId, wikiQuery(query))),
    async execute(userId: string, input: unknown) {
      const command = parseWikiCommand(input);
      return deps.transactions.transact(
        userId,
        { repositoryId: command.repositoryId, pageId: command.pageId },
        { requestId: command.requestId, payload: JSON.stringify(command) },
        async (tx) => {
          if (!canEditWiki(tx.scope.permissions))
            throw new WikiError(403, "Wiki editing requires write, maintain or admin.");
          const replay = await tx.replay();
          if (replay)
            return { requestId: replay.requestId, revision: wikiRevisionDto(replay.revision) };
          if (tx.scope.archived) throw new WikiError(409, "Repository is archived.");
          const current = await tx.pages.load();
          const restored =
            command.action === "restore" ? await tx.pages.revision(command.revisionId) : null;
          const revision = reviseWikiPage(
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
          );
          await tx.pages.save(revision, command.expectedVersion);
          await tx.record(revision);
          return { requestId: command.requestId, revision: wikiRevisionDto(revision) };
        },
      );
    },
  };
}
