import type { Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { EngineeringGraph, ObjectMeasure, Quantity } from "../../../domain/engineering.js";

export function measureRow(row: SqlRow): ObjectMeasure {
  return {
    id: stringValue(row.id),
    repositoryId: stringValue(row.repository_id),
    name: stringValue(row.name),
    subject: stringValue(row.subject),
    unit: literalValue(row.unit, ["m", "pcs"]),
    createdAt: Number(numericValue(row.created_at)),
  };
}
export function quantityRow(row: SqlRow): Quantity | null {
  if (row.measure_id === null || row.measure_id === undefined) return null;
  return {
    measureId: stringValue(row.measure_id),
    value: String(numericValue(row.quantity_value)),
    purpose: literalValue(row.quantity_purpose, ["REFERENCE", "PLANNED"]),
    sourceReference:
      row.source_object_id === null
        ? null
        : {
            objectId: stringValue(row.source_object_id),
            revisionId: stringValue(row.source_revision_id),
          },
  };
}
export async function readEngineeringGraph(
  sql: Sql,
  repositoryId: string,
): Promise<EngineeringGraph> {
  const objects = (
    await sql.query(
      `SELECT o.id object_id,o.version,r.id revision_id,r.name,r.type_id,r.type_name,r.archived,
    r.measure_id,r.quantity_value::text quantity_value,r.quantity_purpose,r.source_object_id,r.source_revision_id
    FROM objects o JOIN object_revisions r ON r.id=o.head_revision_id AND r.object_id=o.id WHERE o.repository_id=$1 ORDER BY o.id`,
      [repositoryId],
      (row) => ({
        objectId: stringValue(row.object_id),
        revisionId: stringValue(row.revision_id),
        version: numberValue(row.version),
        name: stringValue(row.name),
        typeId: stringValue(row.type_id),
        typeName: stringValue(row.type_name),
        archived: booleanValue(row.archived),
        quantity: quantityRow(row),
      }),
    )
  ).rows;
  const edges = (
    await sql.query(
      `SELECT id,version,source_object_id,target_object_id,kind FROM object_relationships WHERE repository_id=$1 AND active AND kind<>'REFERENCE' ORDER BY id`,
      [repositoryId],
      (row) => ({
        relationshipId: stringValue(row.id),
        version: numberValue(row.version),
        sourceObjectId: stringValue(row.source_object_id),
        targetObjectId: stringValue(row.target_object_id),
        kind: literalValue(row.kind, ["REFERENCE", "INCLUDES", "ALLOCATES", "LOCATED_IN"]),
      }),
    )
  ).rows;
  const measures = (
    await sql.query(
      "SELECT * FROM object_measures WHERE repository_id=$1 ORDER BY id",
      [repositoryId],
      measureRow,
    )
  ).rows;
  return { objects, edges, measures };
}
