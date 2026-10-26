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

/** Validate source coverage against the exact candidate selected for publication. */
export function assertContentImportCoverage(lineage: readonly WbsRevision[]): void {
  const imported = lineage.find((revision) => revision.contentImport);
  const importedAction = lineage.some((revision) => revision.action === "import-content-document");
  if (!imported) {
    if (importedAction) throw new WbsError(503, "WBS content import evidence is unavailable.");
    return;
  }
  const evidence = imported.contentImport;
  const candidate = lineage[0];
  if (!evidence || !candidate)
    throw new WbsError(503, "WBS content import evidence is unavailable.");
  const importedNodes = new Map(imported.document.nodes.map((node) => [node.id, node]));
  const mappedContentNodeIds = new Set<string>();
  const mappedWbsNodeIds = new Set<string>();
  const importedContentNodeIds = new Set(imported.document.nodes.map((node) => node.id));
  if (evidence.nodeCoverage.length !== imported.document.nodes.length)
    throw new WbsError(503, "WBS content node coverage is incomplete.");
  for (const mapping of evidence.nodeCoverage) {
    if (mappedContentNodeIds.has(mapping.contentNodeId))
      throw new WbsError(503, "WBS content node coverage is contradictory.");
    if (!importedContentNodeIds.has(mapping.contentNodeId))
      throw new WbsError(503, "WBS content node coverage points outside the imported revision.");
    if (mappedWbsNodeIds.has(mapping.wbsNodeId))
      throw new WbsError(503, "WBS target node coverage is contradictory.");
    const targetNode = importedNodes.get(mapping.wbsNodeId);
    const expectedTargetKind = mapping.sourceKind === "TASK" ? "WORK_PACKAGE" : "DELIVERABLE";
    if (
      !targetNode ||
      mapping.targetKind !== expectedTargetKind ||
      targetNode.kind !== expectedTargetKind
    )
      throw new WbsError(503, "WBS content node coverage has an invalid target kind.");
    mappedContentNodeIds.add(mapping.contentNodeId);
    mappedWbsNodeIds.add(mapping.wbsNodeId);
  }
  const nodes = new Map(candidate.document.nodes.map((node) => [node.id, node]));
  const sourceDefinitions = new Map<string, string>();
  const coveredNodeIds = new Set<string>();
  for (const row of evidence.sourceRows) {
    const key = `${row.documentId}:${row.revisionId}:${row.sourceRowId}`;
    const definition = JSON.stringify({
      disposition: row.disposition,
      wbsNodeIds: [...row.wbsNodeIds],
    });
    const previousDefinition = sourceDefinitions.get(key);
    if (previousDefinition !== undefined && previousDefinition !== definition)
      throw new WbsError(503, "WBS source coverage contains contradictory source evidence.");
    if (previousDefinition !== undefined) continue;
    sourceDefinitions.set(key, definition);
    const rowNodeIds = new Set(row.wbsNodeIds);
    if (rowNodeIds.size !== row.wbsNodeIds.length)
      throw new WbsError(503, "WBS source evidence contains duplicate node mappings.");
    const targets = row.wbsNodeIds.map((id) => nodes.get(id));
    if (targets.some((node) => !node))
      throw new WbsError(409, "WBS candidate no longer contains an imported source node.");
    if (row.disposition === "COMMERCIAL_ONLY") {
      if (row.wbsNodeIds.length)
        throw new WbsError(503, "Commercial-only source evidence unexpectedly maps to WBS work.");
      continue;
    }
    for (const nodeId of row.wbsNodeIds) {
      if (!mappedWbsNodeIds.has(nodeId))
        throw new WbsError(503, "WBS source evidence points outside immutable node coverage.");
      if (coveredNodeIds.has(nodeId))
        throw new WbsError(503, "WBS source evidence maps one node to multiple source rows.");
      coveredNodeIds.add(nodeId);
    }
    if (!targets.some((node) => node?.kind === "WORK_PACKAGE"))
      throw new WbsError(409, "WBS candidate no longer covers a required source work package.");
  }
}

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
  const sourceDefinitions = new Map<string, string>();
  const coveredNodeIds = new Set<string>();
  const sourceRows = source.sourceRows.flatMap((row) => {
    const sourceKey = `${row.documentId}:${row.revisionId}:${row.sourceRowId}`;
    const definition = JSON.stringify({
      disposition: row.disposition,
      nodeIds: [...row.nodeIds],
    });
    const previousDefinition = sourceDefinitions.get(sourceKey);
    if (previousDefinition !== undefined && previousDefinition !== definition)
      throw new WbsError(409, "Content source coverage contains contradictory source evidence.");
    if (previousDefinition !== undefined) return [];
    sourceDefinitions.set(sourceKey, definition);
    const wbsNodeIds = row.nodeIds.map((nodeId) => {
      const wbsNodeId = bySource.get(nodeId);
      if (!wbsNodeId)
        throw new WbsError(409, "Content source coverage no longer matches the imported revision.");
      return wbsNodeId;
    });
    if (new Set(wbsNodeIds).size !== wbsNodeIds.length)
      throw new WbsError(409, "Content source row contains duplicate WBS node mappings.");
    if (row.disposition === "CONTENT_WORK") {
      for (const wbsNodeId of wbsNodeIds) {
        if (coveredNodeIds.has(wbsNodeId))
          throw new WbsError(409, "Content source rows share a WBS node mapping.");
        coveredNodeIds.add(wbsNodeId);
      }
    }
    if (
      row.disposition === "CONTENT_WORK" &&
      !row.nodeIds.some(
        (nodeId) => source.nodes.find((node) => node.id === nodeId)?.kind === "TASK",
      )
    )
      throw new WbsError(409, "Content work source row has no WBS work package.");
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
