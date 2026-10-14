import { parseWbsDocument, type WbsDocument, type WbsNode } from "./document.js";

export type WbsPolicy = Readonly<{
  version: number;
  minimumApprovals: number;
  allowSelfApproval: boolean;
}>;
export const defaultWbsPolicy: WbsPolicy = {
  version: 1,
  minimumApprovals: 1,
  allowSelfApproval: true,
};
export type WbsCheck = Readonly<{ code: string; nodeId: string | null; message: string }>;
export type WbsDifference = Readonly<{
  nodeId: string;
  title: string;
  kind: "ADDED" | "REMOVED" | "CHANGED";
  fields: readonly Readonly<{
    field: keyof Omit<WbsNode, "id">;
    before: string | number | null;
    after: string | number | null;
  }>[];
}>;

/** Publication checks are mandatory; drafts may remain incomplete. */
export function checkWbsPublication(document: WbsDocument): readonly WbsCheck[] {
  const valid = parseWbsDocument(document);
  const packages = valid.nodes.filter((node) => node.kind === "WORK_PACKAGE");
  const failures: WbsCheck[] = [];
  if (!packages.length)
    failures.push({
      code: "WORK_PACKAGE_REQUIRED",
      nodeId: null,
      message: "正式範圍至少需要一個工作包。",
    });
  for (const node of packages) {
    if (!node.deliverable.trim())
      failures.push({
        code: "DELIVERABLE_REQUIRED",
        nodeId: node.id,
        message: `「${node.title}」缺少交付成果。`,
      });
    if (!node.acceptanceCriteria.trim())
      failures.push({
        code: "ACCEPTANCE_REQUIRED",
        nodeId: node.id,
        message: `「${node.title}」缺少驗收要求。`,
      });
  }
  return failures;
}

export function compareWbsDocuments(
  before: WbsDocument | null,
  after: WbsDocument,
): readonly WbsDifference[] {
  const oldNodes = new Map((before?.nodes ?? []).map((node) => [node.id, node]));
  const newNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const fields: readonly (keyof Omit<WbsNode, "id">)[] = [
    "title",
    "kind",
    "parentId",
    "position",
    "description",
    "deliverable",
    "acceptanceCriteria",
  ];
  const result: WbsDifference[] = [];
  for (const id of new Set([...oldNodes.keys(), ...newNodes.keys()])) {
    const old = oldNodes.get(id),
      next = newNodes.get(id);
    const node = next ?? old;
    if (!node) continue;
    const changes = fields
      .filter((field) => old?.[field] !== next?.[field])
      .map((field) => ({
        field,
        before: old?.[field] ?? null,
        after: next?.[field] ?? null,
      }));
    if (changes.length)
      result.push({
        nodeId: id,
        title: node.title,
        kind: !old ? "ADDED" : !next ? "REMOVED" : "CHANGED",
        fields: changes,
      });
  }
  return result;
}
