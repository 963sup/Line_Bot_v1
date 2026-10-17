import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { WbsMetricsQuery } from "../../../contracts/output/metrics.js";
import { parseWbsDocument, WbsError } from "../../../domain/document.js";
import { compareWbsDocuments } from "../../../domain/governance.js";
import { PostgresWbsScopeBoundary } from "./scope-boundary.js";

export class PostgresWbsMetrics implements WbsMetricsQuery {
  constructor(private readonly db: Database = businessDatabase()) {}
  read(userId: string, repositoryId: string) {
    return this.db.transaction(async (sql) => {
      const { repository } = await repositoryContentScope(sql, userId, { repositoryId });
      await new PostgresWbsScopeBoundary(sql).repositoryAvailable(repository.id);
      const count = (
        await sql.query(
          "SELECT count(*)::integer AS n FROM repository_wbs_proposals p JOIN repository_wbs_proposal_versions v ON v.proposal_id=p.id AND v.repository_id=p.repository_id AND v.version=p.version WHERE p.repository_id=$1 AND v.status='OPEN'",
          [repositoryId],
          (r) => ({ n: numberValue(r.n) }),
        )
      ).rows[0];
      if (count === undefined) throw new WbsError(503, "WBS metrics unavailable.");
      const draft = (
        await sql.query(
          "SELECT r.id,r.document FROM repository_wbs h JOIN repository_wbs_revisions r ON r.id=h.head_revision_id AND r.repository_id=h.repository_id WHERE h.repository_id=$1",
          [repositoryId],
          (r) => ({ id: stringValue(r.id), document: parseWbsDocument(r.document) }),
        )
      ).rows[0];
      const baseline = (
        await sql.query(
          "SELECT b.id,b.revision_id,b.number,b.at,r.document FROM repository_wbs_governance g JOIN repository_wbs_baselines b ON b.id=g.published_baseline_id AND b.repository_id=g.repository_id JOIN repository_wbs_revisions r ON r.id=b.revision_id AND r.repository_id=b.repository_id WHERE g.repository_id=$1",
          [repositoryId],
          (r) => ({
            id: stringValue(r.id),
            revisionId: stringValue(r.revision_id),
            number: numberValue(r.number),
            publishedAt: Number(numericValue(r.at)),
            document: parseWbsDocument(r.document),
          }),
        )
      ).rows[0];
      return {
        initialized: Boolean(draft),
        pendingProposals: count.n,
        baseline: baseline
          ? {
              id: baseline.id,
              revisionId: baseline.revisionId,
              number: baseline.number,
              publishedAt: baseline.publishedAt,
            }
          : null,
        draftRevisionId: draft?.id ?? null,
        differences:
          baseline && draft ? compareWbsDocuments(baseline.document, draft.document) : null,
      };
    });
  }
}
