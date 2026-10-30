import { normalizeContent } from "@line_bot_v1/platform/text";
import { ContentError } from "./error.js";
import { normalizeQuantity, normalizeQuantityUnit, type QuantityUnit } from "./quantity.js";

const contentNodeKinds = ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"] as const;
export type ContentNodeKind = (typeof contentNodeKinds)[number];

export function contentParentKind(kind: ContentNodeKind): ContentNodeKind | null {
  return kind === "SUBJECT" ? null : (contentNodeKinds[contentNodeKinds.indexOf(kind) - 1] ?? null);
}

export function eligibleParentNodes<T extends { kind: ContentNodeKind }>(
  nodes: T[],
  kind: ContentNodeKind,
): T[] {
  const parent = contentParentKind(kind);
  return parent === null ? [] : nodes.filter((node) => node.kind === parent);
}

export type ContentResourceKind = "LOCATION" | "EQUIPMENT" | "MATERIAL";

export type ContentMeasure = Readonly<{
  id: string;
  name: string;
  subject: string;
  unit: QuantityUnit;
}>;

export type ContentPlanNode = Readonly<{
  id: string;
  parentId: string | null;
  position: number;
  kind: ContentNodeKind;
  title: string;
  body: string;
  plannedQuantity: Readonly<{ measureId: string; value: string }> | null;
}>;

export type ContentResourcePin = Readonly<{
  nodeId: string;
  resourceId: string;
  resourceRevisionId: string;
  kind: ContentResourceKind;
}>;

export type ContentPlanDocument = Readonly<{
  schemaVersion: 1;
  measures: readonly ContentMeasure[];
  nodes: readonly ContentPlanNode[];
  resourcePins: readonly ContentResourcePin[];
}>;

/** Exact File evidence imported into a Content revision; never the source of File truth. */
export type ContentFileImportEvidence = Readonly<{
  repositoryId: string;
  fileId: string;
  fileRevisionId: string;
  fileSha256: string;
  runId: string;
  processingRevisionId: string;
  observationId: string;
  uncertain: boolean;
  nodeId: string;
}>;

/** Fixed expansion of a complete confirmed Contract document into the Content hierarchy. */
export type ContractDocumentExpansion = Readonly<{
  documentId: string;
  revisionId: string;
  sourceFileId: string;
  sourceFileRevisionId: string;
  sourceFileSha256: string;
  title: string;
  lines: readonly Readonly<{
    sourceRowId: string;
    description: string | null;
    quantity: string | null;
    unit: string | null;
    category: string | null;
    uncertain: boolean;
  }>[];
}>;

export type ContentPlanRevision = Readonly<{
  id: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: "initialize" | "replace" | "import-file" | "import-contract-document";
  document: ContentPlanDocument;
  fileImport?: ContentFileImportEvidence;
  contractDocumentImport?: Readonly<{
    documentId: string;
    revisionId: string;
    fileId: string;
    fileRevisionId: string;
    fileSha256: string;
    mappingVersion: "purchase-order-content-v1";
    rows: readonly Readonly<{
      sourceRowId: string;
      disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
      nodeIds: readonly string[];
    }>[];
  }>;
}>;

function invalid(message: string): never {
  throw new ContentError(400, message, "INVALID_INPUT");
}

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function contentText(title: string, body: string): { title: string; body: string } {
  const result = normalizeContent({ title, body });
  return result.ok ? result.value : invalid("Invalid Content text.");
}

function copyMeasure(measure: ContentMeasure): ContentMeasure {
  return { ...measure };
}

function copyNode(node: ContentPlanNode): ContentPlanNode {
  return {
    ...node,
    plannedQuantity: node.plannedQuantity ? { ...node.plannedQuantity } : null,
  };
}

function copyPin(pin: ContentResourcePin): ContentResourcePin {
  return { ...pin };
}

function copyContentPlanDocument(document: ContentPlanDocument): ContentPlanDocument {
  return {
    schemaVersion: 1,
    measures: document.measures.map(copyMeasure),
    nodes: document.nodes.map(copyNode),
    resourcePins: document.resourcePins.map(copyPin),
  };
}

export function normalizeContentPlanDocument(
  input: ContentPlanDocument,
  current: ContentPlanDocument | null,
): ContentPlanDocument {
  if (input.schemaVersion !== 1) invalid("Unsupported Content plan schema version.");
  if (input.nodes.length > 1000) invalid("Content plan cannot exceed 1000 nodes.");
  if (input.measures.length > 1000 || input.resourcePins.length > 5000)
    invalid("Content plan document is too large.");

  const measureIds = new Set<string>();
  const measures = input.measures.map((measure) => {
    if (!uuid.test(measure.id)) invalid("Invalid Content measure identifier.");
    if (measureIds.has(measure.id)) invalid("Content measure identifiers must be unique.");
    measureIds.add(measure.id);
    const name = contentText(measure.name, "").title;
    const subject = contentText(measure.subject, "").title;
    return { id: measure.id, name, subject, unit: normalizeQuantityUnit(measure.unit) } as const;
  });
  if (current) {
    const nextById = new Map(measures.map((measure) => [measure.id, measure]));
    for (const existing of current.measures) {
      const next = nextById.get(existing.id);
      if (!next || JSON.stringify(next) !== JSON.stringify(existing))
        invalid("Content measure definitions are immutable.");
    }
  }

  const byId = new Map<string, ContentPlanNode>();
  const nodes = input.nodes.map((node) => {
    if (!uuid.test(node.id) || (node.parentId !== null && !uuid.test(node.parentId)))
      invalid("Invalid Content node identifier.");
    if (byId.has(node.id)) invalid("Content node identifiers must be unique.");
    if (!Number.isSafeInteger(node.position) || node.position < 0)
      invalid("Invalid Content node position.");
    if (!contentNodeKinds.includes(node.kind)) invalid("Invalid Content node kind.");
    const text = contentText(node.title, node.body);
    if (text.body.length > 2000) invalid("Content node body cannot exceed 2000 characters.");
    const normalized: ContentPlanNode = {
      ...node,
      title: text.title,
      body: text.body,
      plannedQuantity: node.plannedQuantity ? { ...node.plannedQuantity } : null,
    };
    byId.set(node.id, normalized);
    return normalized;
  });

  const roots = nodes.filter((node) => node.parentId === null);
  if (roots.some((node) => node.kind !== "SUBJECT"))
    invalid("Only Subject nodes may be Content plan roots.");
  if (current) {
    const currentById = new Map(current.nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      const existing = currentById.get(node.id);
      if (existing && existing.kind !== node.kind)
        invalid("Content node identity cannot change kind.");
    }
  }
  const groups = new Map<string, ContentPlanNode[]>();
  const normalizedNodes: ContentPlanNode[] = [];
  for (const node of nodes) {
    const expectedParentKind = contentParentKind(node.kind);
    const parent = node.parentId === null ? null : byId.get(node.parentId);
    if (
      (expectedParentKind === null && node.parentId !== null) ||
      (expectedParentKind !== null && parent?.kind !== expectedParentKind)
    )
      invalid("Content nodes must follow Subject, Object, SubObject, Work and Task directly.");
    let plannedQuantity = node.plannedQuantity;
    if (plannedQuantity) {
      if (node.kind !== "WORK" && node.kind !== "TASK")
        invalid("Only Work and Task nodes may have planned quantities.");
      const measure = measures.find((candidate) => candidate.id === plannedQuantity?.measureId);
      if (!measure) invalid("Content planned quantity must use a plan measure.");
      plannedQuantity = {
        measureId: measure.id,
        value: normalizeQuantity(plannedQuantity.value, measure.unit),
      };
    }
    normalizedNodes.push({ ...node, plannedQuantity });
    const key = node.parentId ?? "ROOT";
    const siblings = groups.get(key) ?? [];
    siblings.push(node);
    groups.set(key, siblings);
  }
  const normalizedById = new Map(normalizedNodes.map((node) => [node.id, node]));
  const orderedNodes: ContentPlanNode[] = [];
  for (const siblings of groups.values()) {
    const normalizedSiblings = siblings.map((node) => normalizedById.get(node.id) ?? node);
    normalizedSiblings.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    if (new Set(normalizedSiblings.map((node) => node.position)).size !== normalizedSiblings.length)
      invalid("Sibling Content node positions must be unique.");
    orderedNodes.push(...normalizedSiblings.map((node, position) => ({ ...node, position })));
  }
  orderedNodes.sort((a, b) => {
    const ai = nodes.findIndex((node) => node.id === a.id);
    const bi = nodes.findIndex((node) => node.id === b.id);
    return ai - bi;
  });

  const pinKeys = new Set<string>();
  const resourcePins = input.resourcePins.map((pin) => {
    if (!uuid.test(pin.resourceId) || !uuid.test(pin.resourceRevisionId))
      invalid("Invalid Content resource pin identifier.");
    if (!byId.has(pin.nodeId)) invalid("Content resource pin node was not found.");
    if (!(["LOCATION", "EQUIPMENT", "MATERIAL"] as const).includes(pin.kind))
      invalid("Invalid Content resource kind.");
    const key = `${pin.nodeId}:${pin.resourceId}`;
    if (pinKeys.has(key)) invalid("Content resource pins must be unique per node and resource.");
    pinKeys.add(key);
    return copyPin(pin);
  });
  resourcePins.sort(
    (left, right) =>
      left.nodeId.localeCompare(right.nodeId) || left.resourceId.localeCompare(right.resourceId),
  );
  return { schemaVersion: 1, measures, nodes: orderedNodes, resourcePins };
}

export function changedResourcePins(
  current: ContentPlanDocument | null,
  next: ContentPlanDocument,
): ContentResourcePin[] {
  const existing = new Set(
    (current?.resourcePins ?? []).map(
      (pin) => `${pin.nodeId}:${pin.resourceId}:${pin.resourceRevisionId}:${pin.kind}`,
    ),
  );
  return next.resourcePins.filter(
    (pin) => !existing.has(`${pin.nodeId}:${pin.resourceId}:${pin.resourceRevisionId}:${pin.kind}`),
  );
}

export function reviseContentPlan(
  current: ContentPlanRevision | null,
  expectedVersion: number,
  action: "initialize" | "replace" | "import-file" | "import-contract-document",
  document: ContentPlanDocument,
  evidence: Readonly<{ id: string; repositoryId: string; actorUserId: string; at: number }>,
): ContentPlanRevision {
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= 2_147_483_647 ||
    !uuid.test(evidence.id) ||
    !evidence.repositoryId ||
    !evidence.actorUserId ||
    !Number.isSafeInteger(evidence.at)
  )
    invalid("Invalid Content revision evidence.");
  if ((current?.version ?? 0) !== expectedVersion)
    throw new ContentError(409, "Content plan version conflict.", "VERSION_CONFLICT");
  if (action === "initialize" ? current !== null : current === null)
    throw new ContentError(409, "Content plan lifecycle conflict.", "LIFECYCLE_CONFLICT");
  const normalized = normalizeContentPlanDocument(document, current?.document ?? null);
  return {
    id: evidence.id,
    repositoryId: evidence.repositoryId,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    actorUserId: evidence.actorUserId,
    at: evidence.at,
    action,
    document: normalized,
  };
}

/** Whole-document mapping. Material and service rows become planned work; freight/other remain commercial-only. */
export function expandContractDocument(
  current: ContentPlanRevision | null,
  expectedVersion: number,
  expansion: ContractDocumentExpansion,
  context: Readonly<{
    id: string;
    repositoryId: string;
    actorUserId: string;
    at: number;
    stableId(seed: string): string;
  }>,
): ContentPlanRevision {
  if (!current)
    throw new ContentError(
      409,
      "Create a Content plan before importing a Contract document.",
      "LIFECYCLE_CONFLICT",
    );
  if (!expansion.lines.length || expansion.lines.length > 1000)
    invalid("Contract document line count is outside Content limits.");
  const documentId = expansion.documentId;
  const sourcePin = `contract-document:${documentId}:${expansion.revisionId}`;
  const subjectId = context.stableId(`${sourcePin}:subject`);
  const objectId = context.stableId(`${sourcePin}:object`);
  const subObjectId = context.stableId(`${sourcePin}:subobject`);
  if (
    [subjectId, objectId, subObjectId].some((id) =>
      current.document.nodes.some((node) => node.id === id),
    )
  )
    throw new ContentError(
      409,
      "Contract document revision already exists in Content.",
      "LIFECYCLE_CONFLICT",
    );
  const sourceRows = new Set<string>();
  const nodes = [...current.document.nodes];
  const measures = [...current.document.measures];
  const coverage: {
    sourceRowId: string;
    disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
    nodeIds: string[];
  }[] = [];
  let position = 0;
  for (const line of expansion.lines) {
    if (!line.sourceRowId || sourceRows.has(line.sourceRowId))
      invalid("Duplicate or empty Contract source row.");
    sourceRows.add(line.sourceRowId);
    if (line.category === "freight" || line.category === "other") {
      coverage.push({ sourceRowId: line.sourceRowId, disposition: "COMMERCIAL_ONLY", nodeIds: [] });
      continue;
    }
    if (line.category !== "material" && line.category !== "service")
      throw new ContentError(
        409,
        "Contract row has no fixed Content disposition.",
        "SOURCE_INVALID",
      );
    if (line.uncertain || !line.description?.trim() || !line.quantity || !line.unit)
      throw new ContentError(
        409,
        "Contract work row is incomplete for fixed Content mapping.",
        "SOURCE_INVALID",
      );
    const unit = normalizeQuantityUnit(line.unit);
    const quantity = normalizeQuantity(line.quantity, unit);
    let measure = measures.find((item) => item.unit === unit);
    if (!measure) {
      measure = {
        id: context.stableId(`${sourcePin}:measure:${unit}`),
        name: unit.slice(0, 100),
        subject: "Contract quantity",
        unit,
      };
      measures.push(measure);
    }
    const workId = context.stableId(`${sourcePin}:row:${line.sourceRowId}:work`);
    const taskId = context.stableId(`${sourcePin}:row:${line.sourceRowId}:task`);
    if ([workId, taskId].some((id) => nodes.some((node) => node.id === id)))
      throw new ContentError(
        409,
        "Contract source row identity already exists in Content.",
        "LIFECYCLE_CONFLICT",
      );
    const title = line.description.trim();
    const prefix = line.category === "material" ? "Supply" : "Service";
    const taskVerb = line.category === "material" ? "Provide" : "Perform";
    nodes.push({
      id: workId,
      parentId: subObjectId,
      position: position++,
      kind: "WORK",
      title: `${prefix}: ${title}`,
      body: "",
      plannedQuantity: { measureId: measure.id, value: quantity },
    });
    nodes.push({
      id: taskId,
      parentId: workId,
      position: 0,
      kind: "TASK",
      title: `${taskVerb}: ${title}`,
      body: "",
      plannedQuantity: { measureId: measure.id, value: quantity },
    });
    coverage.push({
      sourceRowId: line.sourceRowId,
      disposition: "CONTENT_WORK",
      nodeIds: [workId, taskId],
    });
  }
  if (coverage.length !== expansion.lines.length)
    invalid("Every Contract source row must have a Content disposition.");
  if (position > 0) {
    nodes.push({
      id: subjectId,
      parentId: null,
      position: nodes.filter((node) => node.parentId === null).length,
      kind: "SUBJECT",
      title: expansion.title || "Contract scope",
      body: "",
      plannedQuantity: null,
    });
    nodes.push({
      id: objectId,
      parentId: subjectId,
      position: 0,
      kind: "OBJECT",
      title: "Contract scope",
      body: "",
      plannedQuantity: null,
    });
    nodes.push({
      id: subObjectId,
      parentId: objectId,
      position: 0,
      kind: "SUBOBJECT",
      title: "Contract scope",
      body: "",
      plannedQuantity: null,
    });
  }
  const revision = reviseContentPlan(
    current,
    expectedVersion,
    "replace",
    { schemaVersion: 1, measures, nodes, resourcePins: current.document.resourcePins },
    context,
  );
  return {
    ...revision,
    action: "import-contract-document",
    contractDocumentImport: {
      documentId,
      revisionId: expansion.revisionId,
      fileId: expansion.sourceFileId,
      fileRevisionId: expansion.sourceFileRevisionId,
      fileSha256: expansion.sourceFileSha256,
      mappingVersion: "purchase-order-content-v1",
      rows: coverage,
    },
  };
}
