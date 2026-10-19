import type { Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { ObjectTreeDto, StructureNodeDto } from "../../../contracts/dto/objects.js";
import { ObjectError } from "../../../domain/error.js";
import { quantityRow } from "./engineering.js";

// Only archived candidates need descendant traversal. Keep their real parents as context.
function visible(object: string, revision: string) {
  return `($3::boolean OR NOT ${revision}.archived OR EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT target_object_id FROM object_relationships
      WHERE repository_id=$1 AND source_object_id=${object}.id AND active AND kind IN ('INCLUDES','ALLOCATES')
      UNION ALL
      SELECT e.target_object_id FROM object_relationships e JOIN descendants d ON e.source_object_id=d.id
      WHERE e.repository_id=$1 AND e.active AND e.kind IN ('INCLUDES','ALLOCATES')
    ) SELECT 1 FROM descendants d JOIN objects v ON v.id=d.id AND v.repository_id=$1
      JOIN object_revisions vr ON vr.id=v.head_revision_id AND vr.object_id=v.id
      WHERE NOT vr.archived LIMIT 1
  ))`;
}

const selection = `SELECT o.id object_id,o.version,r.id revision_id,r.name,r.type_id,r.type_name,r.archived,
  r.measure_id,r.quantity_value::text quantity_value,r.quantity_purpose,r.source_object_id,r.source_revision_id,
  e.id relationship_id,e.version relationship_version,e.kind relationship_kind,
  EXISTS (SELECT 1 FROM object_relationships ce
    JOIN objects c ON c.id=ce.target_object_id AND c.repository_id=$1
    JOIN object_revisions cr ON cr.id=c.head_revision_id AND cr.object_id=c.id
    WHERE ce.repository_id=$1 AND ce.source_object_id=o.id AND ce.active
      AND ce.kind IN ('INCLUDES','ALLOCATES') AND ${visible("c", "cr")}) has_children
  FROM objects o JOIN object_revisions r ON r.id=o.head_revision_id AND r.object_id=o.id
  LEFT JOIN object_relationships e ON e.repository_id=$1 AND e.target_object_id=o.id
    AND e.active AND e.kind IN ('INCLUDES','ALLOCATES')`;

function node(row: SqlRow): StructureNodeDto {
  return {
    objectId: stringValue(row.object_id),
    revisionId: stringValue(row.revision_id),
    version: numberValue(row.version),
    name: stringValue(row.name),
    typeId: stringValue(row.type_id),
    typeName: stringValue(row.type_name),
    archived: booleanValue(row.archived),
    quantity: quantityRow(row),
    hasChildren: booleanValue(row.has_children),
    relationship:
      row.relationship_id === null
        ? null
        : {
            relationshipId: stringValue(row.relationship_id),
            version: numberValue(row.relationship_version),
            kind: literalValue(row.relationship_kind, ["INCLUDES", "ALLOCATES"]),
          },
  };
}

async function observations(
  sql: Sql,
  repositoryId: string,
  touched: readonly string[],
): Promise<ObjectTreeDto["observed"]> {
  if (!touched.length) return { objects: [], relationships: [] };
  const relationships = (
    await sql.query(
      `WITH seeds(id) AS (
      SELECT unnest($2::uuid[])
      UNION SELECT source_object_id FROM object_relationships
        WHERE repository_id=$1 AND active AND kind='ALLOCATES' AND target_object_id=ANY($2::uuid[])
    ) SELECT id,version,source_object_id,target_object_id,kind FROM object_relationships
    WHERE repository_id=$1 AND active AND (
      (kind='ALLOCATES' AND (source_object_id IN (SELECT id FROM seeds) OR target_object_id IN (SELECT id FROM seeds)))
      OR (kind='INCLUDES' AND target_object_id IN (SELECT id FROM seeds))
      OR (kind='LOCATED_IN' AND source_object_id IN (SELECT id FROM seeds)))`,
      [repositoryId, touched],
      (row) => ({
        relationshipId: stringValue(row.id),
        version: numberValue(row.version),
        sourceObjectId: stringValue(row.source_object_id),
        targetObjectId: stringValue(row.target_object_id),
        kind: literalValue(row.kind, ["INCLUDES", "ALLOCATES", "LOCATED_IN"]),
      }),
    )
  ).rows;
  const ids = [
    ...new Set([
      ...touched,
      ...relationships.flatMap((edge) => [edge.sourceObjectId, edge.targetObjectId]),
    ]),
  ];
  const objects = (
    await sql.query(
      "SELECT id,version FROM objects WHERE repository_id=$1 AND id=ANY($2::uuid[])",
      [repositoryId, ids],
      (row) => ({ objectId: stringValue(row.id), version: numberValue(row.version) }),
    )
  ).rows;
  return { objects, relationships };
}

export async function readObjectTree(
  sql: Sql,
  query: {
    repositoryId: string;
    parentId?: string;
    after?: string;
    includeArchived?: boolean;
  },
): Promise<ObjectTreeDto> {
  const basis = [query.repositoryId, query.parentId ?? null, query.includeArchived ?? false];
  const parent = query.parentId
    ? (
        await sql.query(
          `${selection} WHERE o.repository_id=$1 AND o.id=$2::uuid AND ${visible("o", "r")}`,
          basis,
          node,
        )
      ).rows[0]
    : null;
  if (query.parentId && !parent) throw new ObjectError(404, "找不到此層父 Object。", "NOT_FOUND");
  const rows = (
    await sql.query(
      `${selection} WHERE o.repository_id=$1
      AND ${query.parentId ? "e.source_object_id=$2::uuid" : "($2::uuid IS NULL AND e.id IS NULL)"}
      AND ($4::uuid IS NULL OR o.id>$4) AND ${visible("o", "r")}
      ORDER BY o.id LIMIT 51`,
      [...basis, query.after ?? null],
      node,
    )
  ).rows;
  const items = rows.slice(0, 50);
  return {
    parent: parent ?? null,
    nodes: { items, next: rows.length > 50 ? (items.at(-1)?.objectId ?? null) : null },
    observed: await observations(sql, query.repositoryId, [
      ...(query.parentId ? [query.parentId] : []),
      ...items.map((item) => item.objectId),
    ]),
  };
}
