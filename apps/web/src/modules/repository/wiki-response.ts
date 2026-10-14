import {
  booleanValue,
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { WikiPageSummary, WikiReceipt } from "@line_bot_v1/wiki/contracts/dto/wiki";

export function wikiScope(value: unknown) {
  const v = record(value),
    repository = record(v.repository);
  return {
    actorUserId: stringValue(v.actorUserId),
    repository: {
      id: stringValue(repository.id),
      ownerLogin: stringValue(repository.ownerLogin),
      name: stringValue(repository.name),
    },
    canEdit: booleanValue(v.canEdit),
    archived: booleanValue(v.archived),
    canManageRepository: booleanValue(v.canManageRepository),
  };
}
export function wikiRevision(value: unknown): WikiReceipt["revision"] {
  const v = record(value);
  return {
    id: stringValue(v.id),
    pageId: stringValue(v.pageId),
    repositoryId: stringValue(v.repositoryId),
    version: numberValue(v.version),
    parentRevisionId: nullableString(v.parentRevisionId),
    actorUserId: stringValue(v.actorUserId),
    at: numberValue(v.at),
    action: literalValue(v.action, ["create", "edit", "rename", "archive", "restore"]),
    title: stringValue(v.title),
    body: stringValue(v.body),
    archived: booleanValue(v.archived),
  };
}
export function wikiPages(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.pages)) throw new Error("Wiki 清單格式不正確。");
  const pages: WikiPageSummary[] = v.pages.map((value: unknown) => {
    const p = record(value);
    return {
      pageId: stringValue(p.pageId),
      title: stringValue(p.title),
      version: numberValue(p.version),
      archived: booleanValue(p.archived),
      updatedAt: numberValue(p.updatedAt),
    };
  });
  return { pages, next: nullableString(v.next) };
}
export function wikiHistory(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.revisions)) throw new Error("Wiki 歷史格式不正確。");
  return {
    revisions: v.revisions.map(wikiRevision),
    next: v.next === null ? null : numberValue(v.next),
  };
}
export function wikiComparison(value: unknown) {
  const v = record(value);
  if (!Array.isArray(v.differences)) throw new Error("Wiki 比較格式不正確。");
  return v.differences.map((value: unknown) => {
    const d = record(value);
    if (
      (typeof d.before !== "string" && typeof d.before !== "boolean") ||
      (typeof d.after !== "string" && typeof d.after !== "boolean")
    )
      throw new Error("Wiki 差異格式不正確。");
    return {
      field: literalValue(d.field, ["title", "body", "archived"]),
      before: d.before,
      after: d.after,
    };
  });
}
