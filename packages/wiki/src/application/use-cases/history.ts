import type { WikiHistory } from "../../contracts/dto/wiki.js";
import type { WikiReads } from "../../contracts/output/wiki-pages.js";
import { WikiError } from "../../domain/wiki-error.js";
import { compareWikiRevisions } from "../../domain/wiki-revision.js";
import { type WikiQuery, wikiId, wikiQuery } from "../queries/pages.js";
import { wikiRevisionDto } from "./revision-dto.js";

export function createWikiHistory(reads: WikiReads) {
  return {
    async history(userId: string, query: WikiQuery, before?: number): Promise<WikiHistory> {
      if (
        before !== undefined &&
        (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)
      )
        throw new WikiError(400, "Invalid history cursor.");
      const page = await reads.history(userId, wikiQuery(query), before);
      return { revisions: page.revisions.map(wikiRevisionDto), next: page.next };
    },
    async compare(userId: string, query: WikiQuery, beforeId: string, afterId: string) {
      const scope = wikiQuery(query);
      const before = await reads.read(userId, { ...scope, revisionId: wikiId(beforeId) });
      const after = await reads.read(userId, { ...scope, revisionId: wikiId(afterId) });
      return {
        beforeId: before.id,
        afterId: after.id,
        differences: compareWikiRevisions(before, after),
      };
    },
  };
}
