import type { Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  ResourceQuantityBasis,
  ResourceQuantityReader,
} from "../../../contracts/output/engineering-references.js";
import { ObjectError } from "../../../domain/error.js";
import { normalizeQuantity } from "../../../domain/quantity.js";
import { PostgresObjectReferenceReader } from "./references.js";

export class PostgresResourceQuantityReader implements ResourceQuantityReader {
  constructor(private readonly sql: Sql) {}

  async verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly Readonly<{ resourceId: string; resourceRevisionId: string }>[],
    policy: Readonly<{ allowArchived: boolean }>,
  ): Promise<readonly ResourceQuantityBasis[]> {
    await new PostgresObjectReferenceReader(this.sql).verifyPinned(
      userId,
      repositoryId,
      references.map(({ resourceId, resourceRevisionId }) => ({
        objectId: resourceId,
        revisionId: resourceRevisionId,
      })),
      policy,
    );
    if (!references.length) return [];

    const rows = (
      await this.sql.query(
        `WITH requested AS (
           SELECT resource_id,revision_id,ordinality
           FROM unnest($2::uuid[],$3::uuid[]) WITH ORDINALITY
             AS value(resource_id,revision_id,ordinality)
         )
         SELECT pinned.object_id,pinned.id revision_id,pinned.version,pinned.name,
                pinned.quantity_value::text quantity_value,
                measure.id measure_id,measure.name measure_name,
                measure.subject measure_subject,measure.unit measure_unit,
                requested.ordinality
         FROM requested
         JOIN object_revisions pinned
           ON pinned.repository_id=$1 AND pinned.object_id=requested.resource_id
          AND pinned.id=requested.revision_id
         LEFT JOIN object_measures measure
           ON measure.repository_id=pinned.repository_id AND measure.id=pinned.measure_id
         ORDER BY requested.ordinality`,
        [
          repositoryId,
          references.map((value) => value.resourceId),
          references.map((value) => value.resourceRevisionId),
        ],
      )
    ).rows;
    if (
      rows.length !== references.length ||
      rows.some(
        (row) =>
          row.quantity_value === null ||
          row.quantity_value === undefined ||
          row.measure_id === null ||
          row.measure_id === undefined,
      )
    )
      throw new ObjectError(
        409,
        "指定的 Resource Revision 沒有可執行的計量基準。",
        "LIFECYCLE_CONFLICT",
      );

    return rows.map((row): ResourceQuantityBasis => {
      const unit = literalValue(row.measure_unit, ["m", "pcs"]);
      return {
        resourceId: stringValue(row.object_id),
        resourceRevisionId: stringValue(row.revision_id),
        resourceVersion: numberValue(row.version),
        name: stringValue(row.name),
        measure: {
          id: stringValue(row.measure_id),
          name: stringValue(row.measure_name),
          subject: stringValue(row.measure_subject),
          unit,
        },
        sourceQuantity: normalizeQuantity(stringValue(row.quantity_value), unit),
      };
    });
  }
}
