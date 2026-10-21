import type { Sql } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ContentPlanReferenceReader } from "../../../contracts/output/plan-references.js";
import { ContentError, contentErrorFromUnknown } from "../../../domain/error.js";
import type { ContentPlanNode } from "../../../domain/plan.js";
import type { ContentPlanItemBasis } from "../../../domain/plan-reference.js";
import { readContentPlanRevision } from "./plans.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class PostgresContentPlanReferenceReader implements ContentPlanReferenceReader {
  constructor(private readonly sql: Sql) {}

  async verifyRevision(
    userId: string,
    repositoryId: string,
    planRevisionId: string,
  ): Promise<void> {
    try {
      if (!repositoryId || repositoryId.length > 128 || !uuid.test(planRevisionId))
        throw new ContentError(404, "Content plan revision not found.", "NOT_FOUND");
      await repositoryContentScope(this.sql, userId, { repositoryId });
      if (!(await readContentPlanRevision(this.sql, repositoryId, planRevisionId.toLowerCase())))
        throw new ContentError(404, "Content plan revision not found.", "NOT_FOUND");
    } catch (error) {
      throw contentErrorFromUnknown(error);
    }
  }

  async verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly Readonly<{ planRevisionId: string; nodeId: string }>[],
  ): Promise<readonly ContentPlanItemBasis[]> {
    try {
      if (
        !repositoryId ||
        repositoryId.length > 128 ||
        references.some(
          (reference) => !uuid.test(reference.planRevisionId) || !uuid.test(reference.nodeId),
        )
      )
        throw new ContentError(404, "Content plan item reference not found.", "NOT_FOUND");
      await repositoryContentScope(this.sql, userId, { repositoryId });
      const revisions = new Map<string, Awaited<ReturnType<typeof readContentPlanRevision>>>();
      const result: ContentPlanItemBasis[] = [];
      for (const reference of references) {
        const planRevisionId = reference.planRevisionId.toLowerCase();
        const nodeId = reference.nodeId.toLowerCase();
        let revision = revisions.get(planRevisionId);
        if (revision === undefined) {
          revision = await readContentPlanRevision(this.sql, repositoryId, planRevisionId);
          revisions.set(planRevisionId, revision);
        }
        const node = revision?.document.nodes.find((candidate) => candidate.id === nodeId);
        if (!revision || !node || (node.kind !== "WORK" && node.kind !== "TASK"))
          throw new ContentError(404, "Content plan item reference not found.", "NOT_FOUND");
        const byId = new Map(revision.document.nodes.map((candidate) => [candidate.id, candidate]));
        const path: ContentPlanNode[] = [];
        let cursor: ContentPlanNode | undefined = node;
        while (cursor) {
          path.unshift(cursor);
          cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
        }
        const quantity = node.plannedQuantity;
        const measure = quantity
          ? revision.document.measures.find((candidate) => candidate.id === quantity.measureId)
          : null;
        if (quantity && !measure)
          throw new ContentError(503, "Content plan measure unavailable.", "UNAVAILABLE");
        result.push({
          repositoryId,
          planRevisionId: revision.id,
          planVersion: revision.version,
          node: {
            id: node.id,
            kind: node.kind,
            title: node.title,
            body: node.body,
            path: path.map((entry) => ({ id: entry.id, kind: entry.kind, title: entry.title })),
            plannedQuantity:
              quantity && measure ? { value: quantity.value, measure: { ...measure } } : null,
          },
        });
      }
      return result;
    } catch (error) {
      throw contentErrorFromUnknown(error);
    }
  }
}
