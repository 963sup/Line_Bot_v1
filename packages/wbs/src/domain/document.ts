export class WbsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type WbsNode = Readonly<{
  id: string;
  parentId: string | null;
  position: number;
  kind: "DELIVERABLE" | "WORK_PACKAGE";
  title: string;
  description: string;
  deliverable: string;
  acceptanceCriteria: string;
}>;
export type WbsDocument = Readonly<{ schemaVersion: 1; nodes: readonly WbsNode[] }>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, maximum: number, required = false): string {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) {
    throw new WbsError(400, "WBS 文字欄位不正確或超過長度限制。");
  }
  return value;
}
export function parseWbsNode(value: unknown): WbsNode {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.position) ||
    Number(value.position) < 0 ||
    (value.kind !== "DELIVERABLE" && value.kind !== "WORK_PACKAGE")
  )
    throw new WbsError(400, "WBS 節點格式不正確。");
  const keys = [
    "id",
    "parentId",
    "position",
    "kind",
    "title",
    "description",
    "deliverable",
    "acceptanceCriteria",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new WbsError(400, "WBS 節點包含未知欄位。");
  return {
    id: text(value.id, 128, true),
    parentId: value.parentId === null ? null : text(value.parentId, 128, true),
    position: Number(value.position),
    kind: value.kind,
    title: text(value.title, 200, true).trim(),
    description: text(value.description, 10000),
    deliverable: text(value.deliverable, 10000),
    acceptanceCriteria: text(value.acceptanceCriteria, 10000),
  };
}
export function parseWbsDocument(value: unknown): WbsDocument {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.nodes) ||
    value.nodes.length > 1000
  ) {
    throw new WbsError(400, "WBS 文件格式不正確或超過 1000 個節點。");
  }
  const nodes = value.nodes.map(parseWbsNode);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (byId.size !== nodes.length) throw new WbsError(400, "WBS 節點 ID 重複。");
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (seen.has(parentId) || seen.size >= 32)
        throw new WbsError(400, "WBS 結構循環或超過 32 層。");
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent || parent.kind === "WORK_PACKAGE")
        throw new WbsError(400, "父節點不存在或是工作包。");
      parentId = parent.parentId;
    }
  }
  return { schemaVersion: 1, nodes };
}

export type ContractWbsSource = Readonly<{
  repositoryId: string;
  contractId: string;
  contractRevisionId: string;
  lineId: string;
}>;

export type WbsEdit =
  | Readonly<{
      action: "import-contract";
      node: WbsNode;
      source: ContractWbsSource;
      confirmedDisclosure: true;
    }>
  | Readonly<{ action: "initialize" }>
  | Readonly<{ action: "create-node"; node: WbsNode }>
  | Readonly<{ action: "update-node"; node: WbsNode }>
  | Readonly<{ action: "move-node"; nodeId: string; parentId: string | null; position: number }>
  | Readonly<{ action: "delete-subtree"; nodeId: string }>;

export function applyWbsEdit(document: WbsDocument, edit: WbsEdit): WbsDocument {
  let nodes = [...document.nodes];
  if (edit.action === "initialize") return document;
  const target = nodes.find((n) => n.id === ("node" in edit ? edit.node.id : edit.nodeId));
  if (edit.action === "create-node" || edit.action === "import-contract") {
    if (target) throw new WbsError(409, "WBS 節點已存在。");
    const siblings = nodes
      .filter((n) => n.parentId === edit.node.parentId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    siblings.splice(Math.min(edit.node.position, siblings.length), 0, edit.node);
    nodes = [
      ...nodes.filter((n) => n.parentId !== edit.node.parentId),
      ...siblings.map((n, i) => ({ ...n, position: i })),
    ];
  } else {
    if (!target) throw new WbsError(404, "找不到 WBS 節點。");
    if (edit.action === "update-node") {
      // Structural changes have a separate explicit command.
      nodes = nodes.map((n) =>
        n.id === target.id
          ? { ...edit.node, parentId: target.parentId, position: target.position }
          : n,
      );
    } else if (edit.action === "move-node") {
      const siblings = nodes
        .filter((n) => n.parentId === edit.parentId && n.id !== target.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const index = Math.min(edit.position, siblings.length);
      siblings.splice(index, 0, { ...target, parentId: edit.parentId });
      const moved = new Map(siblings.map((n, i) => [n.id, { ...n, position: i }]));
      nodes = nodes.map((n) => moved.get(n.id) ?? n);
    } else {
      const removed = new Set([target.id]);
      for (let changed = true; changed; ) {
        changed = false;
        for (const n of nodes)
          if (n.parentId !== null && removed.has(n.parentId) && !removed.has(n.id)) {
            removed.add(n.id);
            changed = true;
          }
      }
      nodes = nodes.filter((n) => !removed.has(n.id));
    }
  }
  const normalized: WbsNode[] = [];
  const parents = new Set(nodes.map((n) => n.parentId));
  for (const parent of parents)
    nodes
      .filter((n) => n.parentId === parent)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .forEach((n, i) => normalized.push({ ...n, position: i }));
  return parseWbsDocument({ schemaVersion: 1, nodes: normalized });
}
