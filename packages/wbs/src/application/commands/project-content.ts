import { isRecord } from "@line_bot_v1/platform/validation";
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
  else if (v.action === "create-node" || v.action === "update-node")
    result = { ...base, action: v.action, node: parseWbsNode(v.node) };
  else if (v.action === "import-contract") {
    const node = parseWbsNode(v.node);
    const source = v.source;
    if (
      node.kind !== "WORK_PACKAGE" ||
      node.parentId === null ||
      v.confirmedDisclosure !== true ||
      !isRecord(source)
    )
      throw new WbsError(400, "請明確確認 Contract 來源與 WBS 工作包對應。");
    const ref = source;
    const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (
      typeof ref.repositoryId !== "string" ||
      !ref.repositoryId ||
      ref.repositoryId.length > 128 ||
      !["contractId", "contractRevisionId", "lineId"].every(
        (field) => typeof ref[field] === "string" && uuid.test(String(ref[field])),
      ) ||
      Object.keys(ref).some(
        (key) => !["repositoryId", "contractId", "contractRevisionId", "lineId"].includes(key),
      )
    )
      throw new WbsError(400, "Contract 來源參照不正確。");
    result = {
      ...base,
      action: "import-contract",
      node,
      source: {
        repositoryId: ref.repositoryId,
        contractId: String(ref.contractId).toLowerCase(),
        contractRevisionId: String(ref.contractRevisionId).toLowerCase(),
        lineId: String(ref.lineId).toLowerCase(),
      },
      confirmedDisclosure: true,
    };
  } else if (v.action === "delete-subtree" || v.action === "move-node") {
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
