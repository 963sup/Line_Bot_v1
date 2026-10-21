import { normalizeContent } from "@line_bot_v1/platform/text";
import { WikiError } from "./wiki-error.js";

export type WikiEdit =
  | Readonly<{ action: "create" | "edit"; title: string; body: string }>
  | Readonly<{ action: "rename"; title: string }>
  | Readonly<{ action: "archive" }>
  | Readonly<{ action: "restore"; revisionId: string }>;

export type WikiRevision = Readonly<{
  id: string;
  pageId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: WikiEdit["action"];
  title: string;
  body: string;
  archived: boolean;
}>;

export function reviseWikiPage(
  current: WikiRevision | null,
  expectedVersion: number,
  edit: WikiEdit,
  context: { id: string; pageId: string; repositoryId: string; actorUserId: string; at: number },
  restored: WikiRevision | null = null,
): WikiRevision {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new WikiError(409, "Wiki page version conflict.");
  if (edit.action === "create" ? current !== null : current === null)
    throw new WikiError(409, "Wiki page lifecycle conflict.");
  if (current?.archived && edit.action !== "restore")
    throw new WikiError(409, "Wiki page is archived.");
  let title = current?.title ?? "",
    body = current?.body ?? "",
    archived = false;
  if (edit.action === "create" || edit.action === "edit") {
    title = edit.title;
    body = edit.body;
  }
  if (edit.action === "rename") title = edit.title;
  if (edit.action === "archive") archived = true;
  if (edit.action === "restore") {
    if (
      !restored ||
      restored.id !== edit.revisionId ||
      restored.pageId !== context.pageId ||
      restored.repositoryId !== context.repositoryId
    )
      throw new WikiError(404, "Wiki revision not found in this page.");
    title = restored.title;
    body = restored.body;
  }
  const normalized = normalizeContent({ title, body });
  if (!normalized.ok) throw new WikiError(400, "Invalid Wiki title or content size.");
  ({ title, body } = normalized.value);
  if (
    current &&
    edit.action !== "restore" &&
    title === current.title &&
    body === current.body &&
    archived === current.archived
  )
    throw new WikiError(409, "Wiki content has not changed.");
  return {
    ...context,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    action: edit.action,
    title,
    body,
    archived,
  };
}
