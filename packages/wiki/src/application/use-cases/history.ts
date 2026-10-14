import type { WikiQuery } from "../../contracts/dto/wiki.js";
import type { WikiStore } from "../../contracts/repositories/wiki-pages.js";
import { WikiError } from "../../domain/wiki-page.js";
import { compareWikiRevisions } from "../../domain/wiki-revision.js";
import { wikiId, wikiQuery } from "../queries/pages.js";

export function createWikiHistory(store: WikiStore) {
  return {
    history(userId: string, query: WikiQuery, before?: number) {
      if (
        before !== undefined &&
        (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)
      )
        throw new WikiError(400, "Invalid history cursor.");
      return store.history(userId, wikiQuery(query), before);
    },
    async compare(userId: string, query: WikiQuery, beforeId: string, afterId: string) {
      const scope = wikiQuery(query);
      const before = await store.read(userId, { ...scope, revisionId: wikiId(beforeId) });
      const after = await store.read(userId, { ...scope, revisionId: wikiId(afterId) });
      return {
        beforeId: before.id,
        afterId: after.id,
        differences: compareWikiRevisions(before, after),
      };
    },
  };
}
