import type { Sql } from "@line-work/platform/adapters/postgres";

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
       LEFT JOIN repository_effective_access a
         ON a.repository_id=r.id AND a.user_id=$1
       WHERE i.list_id=ANY($2::text[])
         AND (r.visibility='public' OR a.repository_id IS NOT NULL)
       ORDER BY i.list_id,i.added_at DESC,i.repository_id`,
      [viewerUserId, listIds],
    )
  ).rows as VisibleStarListRepositoryRow[];
}
