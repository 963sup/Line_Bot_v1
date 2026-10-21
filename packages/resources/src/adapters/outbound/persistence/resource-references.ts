import type { Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  ResourceReference,
  ResourceReferenceReader,
} from "../../../contracts/output/resource-references.js";
import { ResourceError, resourceErrorFromUnknown } from "../../../domain/resource-error.js";
import type { ResourceBasis } from "../../../domain/resource-reference.js";

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class PostgresResourceReferenceReader implements ResourceReferenceReader {
  constructor(private readonly sql: Sql) {}

  async verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly ResourceReference[],
    policy: Readonly<{ allowArchived: boolean }>,
  ): Promise<readonly ResourceBasis[]> {
    try {
      if (
        !repositoryId ||
        repositoryId.length > 128 ||
        repositoryId !== repositoryId.trim() ||
        references.some(
          (reference) =>
            !uuidPattern.test(reference.resourceId) ||
            !uuidPattern.test(reference.resourceRevisionId),
        )
      )
        throw new ResourceError(404, "Resource reference not found.", "NOT_FOUND");
      await repositoryContentScope(this.sql, userId, { repositoryId });
      if (references.length === 0) return [];
      const canonicalReferences = references.map((reference) => ({
        resourceId: reference.resourceId.toLowerCase(),
        resourceRevisionId: reference.resourceRevisionId.toLowerCase(),
      }));
      const rows = (
        await this.sql.query(
          `SELECT resource.id,resource.version,resource.head_revision_id,
                  revision.kind,revision.name,revision.state
           FROM repository_resources resource
           JOIN resource_revisions revision
             ON revision.repository_id=resource.repository_id
            AND revision.resource_id=resource.id
            AND revision.id=resource.head_revision_id
           WHERE resource.repository_id=$1 AND resource.id=ANY($2::uuid[])
           ORDER BY resource.id FOR SHARE OF resource`,
          [
            repositoryId,
            [...new Set(canonicalReferences.map(({ resourceId }) => resourceId))].sort(),
          ],
          (value) => ({
            resourceId: stringValue(value.id),
            resourceRevisionId: stringValue(value.head_revision_id),
            resourceVersion: numberValue(value.version),
            kind: literalValue(value.kind, ["LOCATION", "EQUIPMENT", "MATERIAL"]),
            name: stringValue(value.name),
            state: literalValue(value.state, ["ACTIVE", "ARCHIVED"]),
          }),
        )
      ).rows;
      const byId = new Map(rows.map((row) => [row.resourceId, row]));
      return canonicalReferences.map((reference): ResourceBasis => {
        const row = byId.get(reference.resourceId);
        if (!row) throw new ResourceError(404, "Resource reference not found.", "NOT_FOUND");
        if (
          row.resourceRevisionId !== reference.resourceRevisionId ||
          (!policy.allowArchived && row.state !== "ACTIVE")
        )
          throw new ResourceError(
            409,
            "Resource is not eligible at the referenced revision.",
            "SOURCE_INVALID",
          );
        return {
          resourceId: row.resourceId,
          resourceRevisionId: row.resourceRevisionId,
          resourceVersion: row.resourceVersion,
          kind: row.kind,
          name: row.name,
        };
      });
    } catch (error) {
      throw resourceErrorFromUnknown(error);
    }
  }
}
