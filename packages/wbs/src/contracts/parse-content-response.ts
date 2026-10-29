import { isRecord, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { WbsHistory, WbsReceipt, WbsView } from "./dto/content.js";
import type { WbsRevision } from "../domain/content.js";
import { parseWbsDocument } from "../domain/document.js";

function metadata(value: unknown): Omit<WbsRevision, "document"> {
  if (!isRecord(value)) throw new Error("WBS 回應格式不正確。");
  const action = value.action;
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "update-node" &&
    action !== "move-node" &&
    action !== "delete-subtree"
  )
    throw new Error("WBS 歷史操作不正確。");
  return {
    id: stringValue(value.id),
    version: numberValue(value.version),
    parentRevisionId: value.parentRevisionId === null ? null : stringValue(value.parentRevisionId),
    actorUserId: stringValue(value.actorUserId),
    action,
    at: numberValue(value.at),
  };
}
export function wbsRevision(value: unknown): WbsRevision {
  if (!isRecord(value)) throw new Error("WBS Revision 不正確。");
  return { ...metadata(value), document: parseWbsDocument(value.document) };
}
export function wbsView(value: unknown): WbsView {
  if (
    !isRecord(value) ||
    !isRecord(value.repository) ||
    typeof value.canEdit !== "boolean" ||
    typeof value.archived !== "boolean" ||
    typeof value.canManageRepository !== "boolean"
  )
    throw new Error("WBS 回應格式不正確。");
  return {
    repository: {
      id: stringValue(value.repository.id),
      ownerLogin: stringValue(value.repository.ownerLogin),
      name: stringValue(value.repository.name),
    },
    actorUserId: stringValue(value.actorUserId),
    canEdit: value.canEdit,
    canManageRepository: value.canManageRepository,
    archived: value.archived,
    version: numberValue(value.version),
    revision: value.revision === null ? null : wbsRevision(value.revision),
  };
}
export function wbsReceipt(value: unknown): WbsReceipt {
  if (!isRecord(value)) throw new Error("WBS 儲存結果無法確認，請重試原操作。");
  return {
    requestId: stringValue(value.requestId),
    repositoryId: stringValue(value.repositoryId),
    revision: wbsRevision(value.revision),
  };
}
export function wbsHistory(value: unknown): WbsHistory {
  if (!isRecord(value) || !Array.isArray(value.revisions)) throw new Error("WBS 歷史回應不正確。");
  return {
    revisions: value.revisions.map(metadata),
    next: value.next === null ? null : numberValue(value.next),
  };
}
