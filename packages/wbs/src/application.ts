import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsCommand, WbsStore } from "./contracts.js";
import { parseWbsNode, WbsError } from "./domain.js";

export function parseWbsCommand(input: unknown): WbsCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WbsError(400, "WBS 操作格式不正確。");
  const v: Record<string, unknown> = { ...input };
  if (
    typeof v.repositoryId !== "string" ||
    !v.repositoryId ||
    v.repositoryId.length > 128 ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.requestId) ||
    typeof v.expectedVersion !== "number" ||
    !Number.isSafeInteger(v.expectedVersion) ||
    v.expectedVersion < 0
  )
    throw new WbsError(400, "WBS requestId、scope 或版本不正確。");
  const base = {
    repositoryId: v.repositoryId,
    requestId: v.requestId.toLowerCase(),
    expectedVersion: v.expectedVersion,
  };
  let result: WbsCommand;
  if (v.action === "initialize") result = { ...base, action: v.action };
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
  if (Object.keys(v).some((k) => !Object.hasOwn(result, k)))
    throw new WbsError(400, "WBS 操作包含未知欄位。");
  return result;
}
export function createWbs(deps: {
  activeUser: (subject: string) => Promise<{ id: string }>;
  store: () => WbsStore;
  now: () => number;
}) {
  return {
    async read(subject: string, selector: RepositorySelector, revisionId?: string) {
      if (
        revisionId !== undefined &&
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(revisionId)
      )
        throw new WbsError(400, "Revision ID 不正確。");
      return deps.store().read((await deps.activeUser(subject)).id, selector, revisionId);
    },
    async history(subject: string, selector: RepositorySelector, before?: number) {
      if (
        before !== undefined &&
        (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)
      )
        throw new WbsError(400, "歷史游標不正確。");
      return deps.store().history((await deps.activeUser(subject)).id, selector, before);
    },
    async execute(subject: string, input: unknown) {
      const command = parseWbsCommand(input);
      return deps.store().execute((await deps.activeUser(subject)).id, command, deps.now());
    },
  };
}
