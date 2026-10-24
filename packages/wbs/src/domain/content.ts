import { applyWbsEdit, type WbsDocument, type WbsEdit, WbsError } from "./document.js";

/** Private, exact Contract reference pinned by a Project WBS import revision. */
export type WbsContractImportPin = Readonly<{
  repositoryId: string;
  contractId: string;
  contractRevisionId: string;
  lineId: string;
  planRevisionId: string;
  contentNodeId: string;
  nodeId: string;
}>;

export type WbsRevision = Readonly<{
  id: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  action: WbsEdit["action"] | "import-contract";
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

/** Importing an agreement's line is a user-authored WORK_PACKAGE, never an automatic conversion. */
export function importContractWorkPackage(
  current: WbsRevision | null,
  expectedVersion: number,
  node: import("./document.js").WbsNode,
  actorUserId: string,
  id: string,
  at: number,
): WbsRevision {
  if (node.kind !== "WORK_PACKAGE")
    throw new WbsError(400, "Contract line must map to a WBS Work Package.");
  return {
    ...reviseWbsContent(
      current,
      expectedVersion,
      { action: "create-node", node },
      actorUserId,
      id,
      at,
    ),
    action: "import-contract",
  };
}
