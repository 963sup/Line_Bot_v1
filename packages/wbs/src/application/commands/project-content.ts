import type { ProjectWbsCommand } from "../../contracts/dto/project-content.js";
import { parseWbsNode, WbsError } from "../../domain/document.js";

export function parseProjectWbsCommand(input: unknown): ProjectWbsCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WbsError(400, "WBS 操作格式不正確。");
  const v: Record<string, unknown> = { ...input };
  if (
    typeof v.projectId !== "string" ||
    !v.projectId ||
    v.projectId.length > 128 ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.requestId) ||
    typeof v.expectedVersion !== "number" ||
    !Number.isSafeInteger(v.expectedVersion) ||
    v.expectedVersion < 0
  )
    throw new WbsError(400, "WBS requestId、scope 或版本不正確。");
  const base = {
    projectId: v.projectId,
    requestId: v.requestId.toLowerCase(),
    expectedVersion: v.expectedVersion,
  };
  let result: ProjectWbsCommand;
  if (v.action === "import-content-document") {
    if (
      typeof v.repositoryId !== "string" ||
      !v.repositoryId ||
      v.repositoryId.length > 128 ||
      typeof v.contentRevisionId !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.contentRevisionId) ||
      v.confirmedDisclosure !== true
    )
      throw new WbsError(400, "Content 匯入來源或確認狀態不正確。");
    result = {
      ...base,
      action: v.action,
      repositoryId: v.repositoryId,
      contentRevisionId: v.contentRevisionId.toLowerCase(),
      confirmedDisclosure: true,
    };
  } else if (v.action === "initialize") result = { ...base, action: v.action };
  else if (v.action === "create-node" || v.action === "update-node")
    result = { ...base, action: v.action, node: parseWbsNode(v.node) };
  else if (v.action === "delete-subtree" || v.action === "move-node") {
    if (typeof v.nodeId !== "string" || !v.nodeId || v.nodeId.length > 128)
      throw new WbsError(400, "WBS 節點 ID 不正確。");
    if (v.action === "delete-subtree") result = { ...base, action: v.action, nodeId: v.nodeId };
    else {
      if (
        (v.parentId !== null &&
          (typeof v.parentId !== "string" || !v.parentId || v.parentId.length > 128)) ||
        typeof v.position !== "number" ||
        !Number.isSafeInteger(v.position) ||
        v.position < 0
      )
        throw new WbsError(400, "WBS 移動位置不正確。");
      result = {
        ...base,
        action: v.action,
        nodeId: v.nodeId,
        parentId: v.parentId,
        position: v.position,
      };
    }
  } else throw new WbsError(400, "未知 WBS 操作。");
  if (Object.keys(v).some((key) => !Object.hasOwn(result, key)))
    throw new WbsError(400, "WBS 操作包含未知欄位。");
  return result;
}
