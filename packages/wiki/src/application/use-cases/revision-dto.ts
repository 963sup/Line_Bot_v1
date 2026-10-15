import type { WikiRevisionDto } from "../../contracts/dto/wiki.js";
import type { WikiRevision } from "../../domain/wiki-page.js";

export function wikiRevisionDto(revision: WikiRevision): WikiRevisionDto {
  return {
    id: revision.id,
    pageId: revision.pageId,
    repositoryId: revision.repositoryId,
    version: revision.version,
    parentRevisionId: revision.parentRevisionId,
    actorUserId: revision.actorUserId,
    at: revision.at,
    action: revision.action,
    title: revision.title,
    body: revision.body,
    archived: revision.archived,
  };
}
