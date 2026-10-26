import type { Sql } from "@line_bot_v1/platform/postgres";
import { isRecord, literalValue, record, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ContentWbsExpansionReader } from "../../../contracts/output/wbs-expansion.js";
import { ContentError, contentErrorFromUnknown } from "../../../domain/error.js";
import { readContentPlanRevision } from "./plans.js";

function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

type CurrentSourceNode = Readonly<{
  id: string;
  kind?: "SUBJECT" | "OBJECT" | "SUBOBJECT" | "WORK" | "TASK";
}>;
type CurrentSourceRow = Readonly<{
  documentId: string;
  revisionId: string;
  sourceRowId: string;
  disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
  nodeIds: readonly string[];
}>;

/** Rejects stale or contradictory immutable provenance before exposing a WBS source snapshot. */
export function assertCurrentSourceCoverage(
  nodes: readonly CurrentSourceNode[],
  sourceRows: readonly CurrentSourceRow[],
): void {
  const currentNodes = new Map(nodes.map((node) => [node.id, node]));
  const sourceDefinitions = new Map<string, string>();
  const coveredNodeIds = new Set<string>();
  for (const row of sourceRows) {
    const sourceKey = `${row.documentId}:${row.revisionId}:${row.sourceRowId}`;
    if (!row.documentId || !row.revisionId || !row.sourceRowId)
      throw new ContentError(
        503,
        "Content source coverage contains an incomplete source key.",
        "UNAVAILABLE",
      );
    const definition = JSON.stringify({
      disposition: row.disposition,
      nodeIds: [...row.nodeIds].sort(),
    });
    const previousDefinition = sourceDefinitions.get(sourceKey);
    if (previousDefinition !== undefined)
      throw new ContentError(
        503,
        previousDefinition === definition
          ? "Content source coverage contains duplicate source evidence."
          : "Content source coverage contains contradictory source evidence.",
        "UNAVAILABLE",
      );
    sourceDefinitions.set(sourceKey, definition);
    if (row.disposition === "COMMERCIAL_ONLY" && row.nodeIds.length > 0)
      throw new ContentError(
        503,
        "Commercial-only source evidence unexpectedly maps to Content nodes.",
        "UNAVAILABLE",
      );
    if (new Set(row.nodeIds).size !== row.nodeIds.length)
      throw new ContentError(
        503,
        "Content source evidence contains duplicate node mappings.",
        "UNAVAILABLE",
      );
    if (row.disposition === "CONTENT_WORK" && row.nodeIds.length !== 2)
      throw new ContentError(
        503,
        "Content work source evidence must contain one WORK and one TASK.",
        "UNAVAILABLE",
      );
    const mappedNodes = row.nodeIds.map((nodeId) => currentNodes.get(nodeId));
    if (mappedNodes.some((node) => !node))
      throw new ContentError(
        409,
        "Content source evidence no longer matches the selected revision.",
        "SOURCE_INVALID",
      );
    if (
      row.disposition === "CONTENT_WORK" &&
      mappedNodes.some((node) => node?.kind !== undefined) &&
      !mappedNodes.some((node) => node?.kind === "WORK")
    )
      throw new ContentError(503, "Content work source evidence has no WORK node.", "UNAVAILABLE");
    if (
      row.disposition === "CONTENT_WORK" &&
      mappedNodes.some((node) => node?.kind !== undefined) &&
      !mappedNodes.some((node) => node?.kind === "TASK")
    )
      throw new ContentError(503, "Content work source evidence has no TASK node.", "UNAVAILABLE");
    for (const nodeId of row.nodeIds) {
      if (coveredNodeIds.has(nodeId))
        throw new ContentError(
          503,
          "Content source evidence maps one node to multiple source rows.",
          "UNAVAILABLE",
        );
      coveredNodeIds.add(nodeId);
    }
  }
}

export class PostgresContentWbsExpansionReader implements ContentWbsExpansionReader {
  constructor(private readonly sql: Sql) {}

  async read(actor: string, repositoryId: string, revisionId: string) {
    try {
      await repositoryContentScope(this.sql, actor, { repositoryId });
      const revision = await readContentPlanRevision(this.sql, repositoryId, revisionId);
      if (!revision) throw new ContentError(404, "Content plan revision not found.", "NOT_FOUND");
      const lineage = (
        await this.sql.query(
          `WITH RECURSIVE revisions AS (
             SELECT id,parent_revision_id,contract_document_import
               FROM content_plan_revisions WHERE repository_id=$1 AND id=$2
             UNION ALL
             SELECT parent.id,parent.parent_revision_id,parent.contract_document_import
               FROM content_plan_revisions parent JOIN revisions child
                 ON parent.repository_id=$1 AND parent.id=child.parent_revision_id
           )
           SELECT contract_document_import FROM revisions WHERE contract_document_import IS NOT NULL`,
          [repositoryId, revision.id],
          (row) => ({ value: row.contract_document_import }),
        )
      ).rows;
      const sourceRows = lineage.flatMap(({ value }) => {
        const parsed = parsedJson(value);
        if (!isRecord(parsed))
          throw new ContentError(503, "Content source coverage is invalid.", "UNAVAILABLE");
        const imported = record(parsed);
        if (!Array.isArray(imported.rows))
          throw new ContentError(503, "Content source coverage is invalid.", "UNAVAILABLE");
        return imported.rows.map((item) => {
          const row = record(item);
          if (!Array.isArray(row.nodeIds))
            throw new ContentError(503, "Content source coverage is invalid.", "UNAVAILABLE");
          return {
            documentId: stringValue(imported.documentId),
            revisionId: stringValue(imported.revisionId),
            sourceRowId: stringValue(row.sourceRowId),
            disposition: literalValue(row.disposition, ["CONTENT_WORK", "COMMERCIAL_ONLY"]),
            nodeIds: row.nodeIds.map(stringValue),
          };
        });
      });
      assertCurrentSourceCoverage(revision.document.nodes, sourceRows);
      return {
        repositoryId,
        revisionId: revision.id,
        version: revision.version,
        nodes: revision.document.nodes.map(({ id, parentId, position, kind, title, body }) => ({
          id,
          parentId,
          position,
          kind,
          title,
          body,
        })),
        sourceRows,
      };
    } catch (error) {
      throw contentErrorFromUnknown(error);
    }
  }
}
