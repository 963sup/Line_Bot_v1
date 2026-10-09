import type { Sql } from "@line_bot_v1/platform/postgres";

export type VisibleStarListRepositoryRow = Readonly<{
  list_id: string;
  repository_id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  repository_name: string;
  repository_visibility: string;
  added_at: number | string;
}>;

export async function readVisibleStarListRepositoryRows(
  sql: Sql,
  viewerUserId: string,
  listIds: readonly string[],
): Promise<VisibleStarListRepositoryRow[]> {
  if (!listIds.length) return [];
  return (
    await sql.query(
      `SELECT i.list_id,i.repository_id,i.added_at,
              r.owner_account_id,r.owner_account_kind,
              r.name AS repository_name,r.visibility AS repository_visibility
       FROM repository_star_list_items i
       JOIN repositories r ON r.id=i.repository_id
       WHERE i.list_id=ANY($2::text[])
         AND EXISTS (
           SELECT 1
           FROM repository_visibility_access v
           WHERE v.repository_id=r.id
             AND (v.user_id=$1 OR v.user_id IS NULL)
         )
       ORDER BY i.list_id,i.added_at DESC,i.repository_id`,
      [viewerUserId, listIds],
    )
  ).rows as VisibleStarListRepositoryRow[];
}
