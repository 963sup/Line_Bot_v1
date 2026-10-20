import type { Sql } from "@line_bot_v1/platform/postgres";
import { booleanValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { ObjectReferenceReader } from "../../../contracts/output/references.js";
import { ObjectError } from "../../../domain/error.js";

export class PostgresObjectReferenceReader implements ObjectReferenceReader {
  constructor(private readonly sql: Sql) {}

  async verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly Readonly<{ objectId: string; revisionId: string }>[],
    policy: Readonly<{ allowArchived: boolean }>,
  ) {
    await repositoryContentScope(this.sql, userId, { repositoryId });
    if (!references.length) return [];
    const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (references.some((value) => !uuid.test(value.objectId) || !uuid.test(value.revisionId)))
      throw new ObjectError(404, "找不到指定的 Object Revision。", "NOT_FOUND");
    await this.sql.query(
      `SELECT id FROM objects
       WHERE repository_id=$1 AND id=ANY($2::uuid[])
       ORDER BY id FOR SHARE`,
      [repositoryId, [...new Set(references.map((value) => value.objectId))].sort()],
    );
    const rows = (
      await this.sql.query(
        `WITH requested AS (
           SELECT object_id,revision_id,ordinality
           FROM unnest($2::uuid[],$3::uuid[]) WITH ORDINALITY AS value(object_id,revision_id,ordinality)
         )
         SELECT pinned.object_id,pinned.id revision_id,pinned.version pinned_version,
                pinned.name,pinned.type_id,pinned.type_name,
                current.archived,o.head_revision_id current_revision_id,o.version current_version,
                (o.version>pinned.version) has_newer_revision,requested.ordinality
         FROM requested
         JOIN object_revisions pinned
           ON pinned.repository_id=$1 AND pinned.object_id=requested.object_id
          AND pinned.id=requested.revision_id
         JOIN objects o ON o.repository_id=$1 AND o.id=pinned.object_id
         JOIN object_revisions current ON current.id=o.head_revision_id AND current.object_id=o.id
         ORDER BY requested.ordinality`,
        [
          repositoryId,
          references.map((value) => value.objectId),
          references.map((value) => value.revisionId),
        ],
        (row) => ({
          objectId: stringValue(row.object_id),
          revisionId: stringValue(row.revision_id),
          pinnedVersion: numberValue(row.pinned_version),
          name: stringValue(row.name),
          typeId: stringValue(row.type_id),
          typeName: stringValue(row.type_name),
          archived: booleanValue(row.archived),
          currentRevisionId: stringValue(row.current_revision_id),
          currentVersion: numberValue(row.current_version),
          hasNewerRevision: booleanValue(row.has_newer_revision),
        }),
      )
    ).rows;
    if (rows.length !== references.length)
      throw new ObjectError(404, "找不到指定的 Object Revision。", "NOT_FOUND");
    if (!policy.allowArchived && rows.some((value) => value.archived))
      throw new ObjectError(409, "封存的 Object 不可新增引用。", "OBJECT_ARCHIVED");
    return rows;
  }
}
