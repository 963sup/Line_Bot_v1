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
  if (v.action === "initialize") result = { ...base, action: v.action };
  else if (v.action === "import-contract") {
    const node = parseWbsNode(v.node);
    const source = v.source;
    const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (
      node.kind !== "WORK_PACKAGE" ||
      v.acknowledged !== true ||
      !source ||
      typeof source !== "object" ||
      Array.isArray(source)
    )
      throw new WbsError(400, "Reviewed Contract Work Package import is invalid.");
    const ref: Record<string, unknown> = { ...source };
    if (
      Object.keys(ref).some(
        (key) => !["repositoryId", "contractId", "contractRevisionId", "lineId"].includes(key),
      ) ||
      typeof ref.repositoryId !== "string" ||
      !ref.repositoryId ||
      ref.repositoryId.length > 128 ||
      typeof ref.contractId !== "string" ||
      !uuid.test(ref.contractId) ||
      typeof ref.contractRevisionId !== "string" ||
      !uuid.test(ref.contractRevisionId) ||
      typeof ref.lineId !== "string" ||
      !uuid.test(ref.lineId)
    )
      throw new WbsError(400, "Exact Contract line reference is required.");
    result = {
      ...base,
      action: "import-contract",
      acknowledged: true,
      source: {
        repositoryId: ref.repositoryId,
        contractId: ref.contractId.toLowerCase(),
        contractRevisionId: ref.contractRevisionId.toLowerCase(),
        lineId: ref.lineId.toLowerCase(),
      },
      node,
    };
  }
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
