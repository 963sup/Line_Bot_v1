import { isRecord, literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { WbsRevision } from "../domain/content.js";
import { parseWbsDocument } from "../domain/document.js";
import type {
  ProjectWbsHistory,
  ProjectWbsReceipt,
  ProjectWbsView,
} from "./dto/project-content.js";

function contentImport(value: unknown): NonNullable<WbsRevision["contentImport"]> {
  if (
    !isRecord(value) ||
    value.mappingVersion !== "content-wbs-v1" ||
    !Array.isArray(value.nodeCoverage) ||
    !Array.isArray(value.sourceRows)
  )
    throw new Error("WBS Content 來源證據格式不正確。");
  return {
    repositoryId: stringValue(value.repositoryId),
    contentRevisionId: stringValue(value.contentRevisionId),
    contentVersion: numberValue(value.contentVersion),
    mappingVersion: "content-wbs-v1",
    nodeCoverage: value.nodeCoverage.map((item) => {
      if (!isRecord(item)) throw new Error("WBS Content 來源證據格式不正確。");
      return {
        contentNodeId: stringValue(item.contentNodeId),
        wbsNodeId: stringValue(item.wbsNodeId),
        sourceKind: literalValue(item.sourceKind, [
          "SUBJECT",
          "OBJECT",
          "SUBOBJECT",
          "WORK",
          "TASK",
        ]),
        targetKind: literalValue(item.targetKind, ["DELIVERABLE", "WORK_PACKAGE"]),
      };
    }),
    sourceRows: value.sourceRows.map((item) => {
      if (!isRecord(item) || !Array.isArray(item.wbsNodeIds))
        throw new Error("WBS Content 來源證據格式不正確。");
      return {
        documentId: stringValue(item.documentId),
        revisionId: stringValue(item.revisionId),
        sourceRowId: stringValue(item.sourceRowId),
        disposition: literalValue(item.disposition, ["CONTENT_WORK", "COMMERCIAL_ONLY"]),
        wbsNodeIds: item.wbsNodeIds.map(stringValue),
      };
    }),
  };
}

function metadata(value: unknown): Omit<WbsRevision, "document"> {
  if (!isRecord(value)) throw new Error("WBS 回應格式不正確。");
  const action = value.action;
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "import-contract" &&
    action !== "import-content-document" &&
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
  return {
    ...metadata(value),
    ...(value.contentImport ? { contentImport: contentImport(value.contentImport) } : {}),
    document: parseWbsDocument(value.document),
  };
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
    revisions: value.revisions.map((item) => {
      const meta = metadata(item);
      if (isRecord(item) && item.contentImport)
        return { ...meta, contentImport: contentImport(item.contentImport) };
      return meta;
    }),
    next: value.next === null ? null : numberValue(value.next),
  };
}
