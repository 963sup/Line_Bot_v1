import { applyWbsEdit, type WbsDocument, type WbsEdit, WbsError } from "./document.js";

export type WbsRevision = Readonly<{
  id: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  action: WbsEdit["action"];
  at: number;
  document: WbsDocument;
}>;

/** The content aggregate is the current immutable revision selected by its head. */
export function reviseWbsContent(
  current: WbsRevision | null,
  expectedVersion: number,
  edit: WbsEdit,
  actorUserId: string,
  id: string,
  at: number,
): WbsRevision {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new WbsError(409, "WBS 已更新；請重新讀取並確認你的修改。");
  if (edit.action === "initialize" ? Boolean(current) : !current)
    throw new WbsError(409, "WBS 初始化狀態不符合此操作。");
  const document = applyWbsEdit(current?.document ?? { schemaVersion: 1, nodes: [] }, edit);
  if (current && JSON.stringify(document) === JSON.stringify(current.document))
    throw new WbsError(409, "WBS 內容沒有變更。");
  return {
    id,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    actorUserId,
    action: edit.action,
    at,
    document,
  };
}
