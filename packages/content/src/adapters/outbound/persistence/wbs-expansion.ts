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
