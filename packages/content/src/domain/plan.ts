import { normalizeContent } from "@line_bot_v1/platform/text";
import { ContentError } from "./error.js";
import { normalizeQuantity, normalizeQuantityUnit, type QuantityUnit } from "./quantity.js";

const contentNodeKinds = ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"] as const;
export type ContentNodeKind = (typeof contentNodeKinds)[number];
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

export type ContentFileImportTarget = Readonly<{
  id: string;
  parentId: string;
  kind: "WORK" | "TASK";
  title: string;
  body: string;
  measureId: string;
  quantity: string;
  newMeasure?: ContentMeasure;
}>;

export type ContentPlanRevision = Readonly<{
  id: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: "initialize" | "replace" | "import-file";
  document: ContentPlanDocument;
  fileImport?: ContentFileImportEvidence;
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
    const expectedParentKind =
      node.kind === "SUBJECT" ? null : contentNodeKinds[contentNodeKinds.indexOf(node.kind) - 1];
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
  action: "initialize" | "replace" | "import-file",
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

/** A verified saved observation is only evidence; the user supplies the Content meaning. */
export function importFileContentNode(
  current: ContentPlanRevision | null,
  expectedVersion: number,
  target: ContentFileImportTarget,
  source: Omit<ContentFileImportEvidence, "nodeId">,
  context: Readonly<{ id: string; repositoryId: string; actorUserId: string; at: number }>,
): ContentPlanRevision {
  if (!current)
    throw new ContentError(
      409,
      "Create a Content plan before importing a File.",
      "LIFECYCLE_CONFLICT",
    );
  if (source.repositoryId !== context.repositoryId)
    throw new ContentError(409, "File source belongs to another Repository.", "SOURCE_INVALID");
  const parent = current.document.nodes.find((node) => node.id === target.parentId);
  if (
    (target.kind === "WORK" && parent?.kind !== "SUBOBJECT") ||
    (target.kind === "TASK" && parent?.kind !== "WORK")
  )
    invalid("Select an existing legal Content parent for the imported work.");
  if (current.document.nodes.some((node) => node.id === target.id))
    invalid("Imported Content node identity already exists.");
  if (
    target.newMeasure &&
    (target.newMeasure.id !== target.measureId ||
      current.document.measures.some((measure) => measure.id === target.newMeasure?.id))
  )
    invalid("Imported Content measure identity is not available.");
  const position = current.document.nodes.filter(
    (node) => node.parentId === target.parentId,
  ).length;
  const next = reviseContentPlan(
    current,
    expectedVersion,
    "import-file",
    {
      schemaVersion: 1,
      measures: target.newMeasure
        ? [...current.document.measures, target.newMeasure]
        : current.document.measures,
      nodes: [
        ...current.document.nodes,
        {
          id: target.id,
          parentId: target.parentId,
          kind: target.kind,
          position,
          title: target.title,
          body: target.body,
          plannedQuantity: { measureId: target.measureId, value: target.quantity },
        },
      ],
      resourcePins: current.document.resourcePins,
    },
    context,
  );
  return { ...next, fileImport: { ...source, nodeId: target.id } };
}
