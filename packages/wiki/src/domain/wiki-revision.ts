import type { WikiRevision } from "./wiki-page.js";

export function compareWikiRevisions(before: WikiRevision, after: WikiRevision) {
  return (["title", "body", "archived"] as const).flatMap((field) =>
    before[field] === after[field] ? [] : [{ field, before: before[field], after: after[field] }],
  );
}
