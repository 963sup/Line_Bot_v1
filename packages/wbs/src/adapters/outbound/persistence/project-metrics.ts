import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import { createPostgresProjectContentScope } from "@line_bot_v1/project/composition/bootstrap/project-content-scope";
import type { ProjectWbsMetricsQuery } from "../../../contracts/output/project-metrics.js";
import { parseWbsDocument, WbsError } from "../../../domain/document.js";
import { compareWbsDocuments } from "../../../domain/governance.js";

export class PostgresProjectWbsMetrics implements ProjectWbsMetricsQuery {
  constructor(private readonly db: Database = businessDatabase()) {}
  read(userId: string, projectId: string) {
    return this.db.transaction(async (sql) => {
      const { project } = await createPostgresProjectContentScope(sql).read(userId, projectId);
      const count = (
        await sql.query(
          "SELECT count(*)::integer AS n FROM project_wbs_proposals p JOIN project_wbs_proposal_versions v ON v.proposal_id=p.id AND v.project_id=p.project_id AND v.version=p.version WHERE p.project_id=$1 AND v.status='OPEN'",
          [project.id],
          (r) => ({ n: numberValue(r.n) }),
        )
      ).rows[0];
      if (count === undefined) throw new WbsError(503, "WBS metrics unavailable.");
      const draft = (
        await sql.query(
          "SELECT r.id,r.document FROM project_wbs h JOIN project_wbs_revisions r ON r.id=h.head_revision_id AND r.project_id=h.project_id WHERE h.project_id=$1",
          [project.id],
          (r) => ({ id: stringValue(r.id), document: parseWbsDocument(r.document) }),
        )
      ).rows[0];
      const baseline = (
        await sql.query(
          "SELECT b.id,b.revision_id,b.number,b.at,r.document FROM project_wbs_governance g JOIN project_wbs_baselines b ON b.id=g.published_baseline_id AND b.project_id=g.project_id JOIN project_wbs_revisions r ON r.id=b.revision_id AND r.project_id=b.project_id WHERE g.project_id=$1",
          [project.id],
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
