import { isRecord, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  ProjectWbsHistory,
  ProjectWbsReceipt,
  ProjectWbsView,
} from "@line_bot_v1/wbs/contracts/dto/project-content";
import type { WbsRevision } from "@line_bot_v1/wbs/domain/content";
import { parseWbsDocument } from "@line_bot_v1/wbs/domain/document";

function metadata(value: unknown): Omit<WbsRevision, "document"> {
  if (!isRecord(value)) throw new Error("WBS 回應格式不正確。");
  const action = value.action;
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "update-node" &&
    action !== "move-node" &&
    action !== "delete-subtree" &&
    action !== "import-contract"
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
export function projectWbsView(value: unknown): ProjectWbsView {
  if (
    !isRecord(value) ||
    !isRecord(value.project) ||
    typeof value.canEdit !== "boolean" ||
    typeof value.closed !== "boolean" ||
    typeof value.canManageProject !== "boolean"
  )
    throw new Error("WBS 回應格式不正確。");
  return {
    project: {
      id: stringValue(value.project.id),
      title: stringValue(value.project.title),
    },
    actorUserId: stringValue(value.actorUserId),
    canEdit: value.canEdit,
    canManageProject: value.canManageProject,
    closed: value.closed,
    version: numberValue(value.version),
    revision: value.revision === null ? null : wbsRevision(value.revision),
  };
}
export function projectWbsReceipt(value: unknown): ProjectWbsReceipt {
  if (!isRecord(value)) throw new Error("WBS 儲存結果無法確認，請重試原操作。");
  return {
    requestId: stringValue(value.requestId),
    projectId: stringValue(value.projectId),
    revision: wbsRevision(value.revision),
  };
}
export function projectWbsHistory(value: unknown): ProjectWbsHistory {
  if (!isRecord(value) || !Array.isArray(value.revisions)) throw new Error("WBS 歷史回應不正確。");
  return {
    revisions: value.revisions.map(metadata),
    next: value.next === null ? null : numberValue(value.next),
  };
}
