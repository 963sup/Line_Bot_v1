import type { WikiQuery } from "../../contracts/dto/wiki.js";
import { WikiError } from "../../domain/wiki-page.js";

export function wikiId(value: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
    throw new WikiError(400, "Invalid Wiki identifier.");
  return value.toLowerCase();
}
export function wikiQuery(query: WikiQuery) {
  if (!query.repositoryId || query.repositoryId.length > 128)
    throw new WikiError(400, "Invalid Repository scope.");
  return {
    repositoryId: query.repositoryId,
    pageId: wikiId(query.pageId),
    ...(query.revisionId === undefined ? {} : { revisionId: wikiId(query.revisionId) }),
  };
}
