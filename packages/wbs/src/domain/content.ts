import {
  applyWbsEdit,
  parseWbsDocument,
  type WbsDocument,
  type WbsEdit,
  WbsError,
} from "./document.js";

export type ContentWbsSource = Readonly<{
  repositoryId: string;
  revisionId: string;
  version: number;
  nodes: readonly Readonly<{
    id: string;
    parentId: string | null;
    position: number;
    kind: "SUBJECT" | "OBJECT" | "SUBOBJECT" | "WORK" | "TASK";
    title: string;
    body: string;
  }>[];
  sourceRows: readonly Readonly<{
    documentId: string;
    revisionId: string;
    sourceRowId: string;
    disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
    nodeIds: readonly string[];
  }>[];
}>;

export type WbsContentImportEvidence = Readonly<{
  repositoryId: string;
  contentRevisionId: string;
  contentVersion: number;
  mappingVersion: "content-wbs-v1";
  nodeCoverage: readonly Readonly<{
    contentNodeId: string;
    wbsNodeId: string;
    sourceKind: ContentWbsSource["nodes"][number]["kind"];
    targetKind: "DELIVERABLE" | "WORK_PACKAGE";
  }>[];
  sourceRows: readonly Readonly<{
    documentId: string;
    revisionId: string;
    sourceRowId: string;
    disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
    wbsNodeIds: readonly string[];
  }>[];
}>;

export type WbsRevision = Readonly<{
  id: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  action: WbsEdit["action"] | "import-contract" | "import-content-document";
  at: number;
  document: WbsDocument;
  contentImport?: WbsContentImportEvidence;
}>;

/** Fixed one-shot Content hierarchy projection. It initializes an empty WBS draft and never publishes a Baseline. */
export function importContentWbs(
  current: WbsRevision | null,
  expectedVersion: number,
  source: ContentWbsSource,
  projectId: string,
  actorUserId: string,
  id: string,
  at: number,
  stableId: (seed: string) => string,
): WbsRevision {
  if (current || expectedVersion !== 0)
    throw new WbsError(409, "Content-to-WBS expansion requires an uninitialized Project WBS.");
  if (!source.nodes.length || source.nodes.length > 1000)
    throw new WbsError(409, "Content revision has no WBS-compatible scope or exceeds WBS limits.");
  const bySource = new Map<string, string>();
  const nodeCoverage = source.nodes.map((node) => {
    if (bySource.has(node.id))
      throw new WbsError(409, "Content revision contains duplicate node identities.");
    const wbsNodeId = stableId(`content-wbs-v1:${projectId}:${node.id}`);
    bySource.set(node.id, wbsNodeId);
    return {
      contentNodeId: node.id,
      wbsNodeId,
      sourceKind: node.kind,
      targetKind: node.kind === "TASK" ? ("WORK_PACKAGE" as const) : ("DELIVERABLE" as const),
    };
  });
  const nodes = source.nodes.map((node): import("./document.js").WbsNode => {
    const id = bySource.get(node.id);
    const parentId = node.parentId === null ? null : bySource.get(node.parentId);
    if (!id || (node.parentId !== null && !parentId))
      throw new WbsError(409, "Content revision contains an unresolved parent reference.");
    return {
      id,
      parentId: parentId ?? null,
      position: node.position,
      kind: node.kind === "TASK" ? "WORK_PACKAGE" : "DELIVERABLE",
      title: node.title,
      description: node.body,
      deliverable: "",
      acceptanceCriteria: "",
    };
  });
  const document = parseWbsDocument({ schemaVersion: 1, nodes });
  const sourceRows = source.sourceRows.map((row) => {
    const wbsNodeIds = row.nodeIds.map((nodeId) => {
      const wbsNodeId = bySource.get(nodeId);
      if (!wbsNodeId)
        throw new WbsError(409, "Content source coverage no longer matches the imported revision.");
      return wbsNodeId;
    });
    if (row.disposition === "CONTENT_WORK" && wbsNodeIds.length === 0)
      throw new WbsError(409, "Content work source row has no WBS target.");
    if (row.disposition === "COMMERCIAL_ONLY" && wbsNodeIds.length !== 0)
      throw new WbsError(409, "Commercial-only source row unexpectedly maps to WBS work.");
    return { ...row, wbsNodeIds };
  });
  return {
    id,
    version: 1,
    parentRevisionId: null,
    actorUserId,
    action: "import-content-document",
    at,
    document,
    contentImport: {
      repositoryId: source.repositoryId,
      contentRevisionId: source.revisionId,
      contentVersion: source.version,
      mappingVersion: "content-wbs-v1",
      nodeCoverage,
      sourceRows,
    },
  };
}

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
