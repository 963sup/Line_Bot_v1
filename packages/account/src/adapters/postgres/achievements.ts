import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type {
  UserAchievement,
  UserAchievementStore,
} from "../../application/ports/achievements.js";

type AchievementRow = {
  achievement_id: string;
  name: string;
  description: string;
  icon_ref: string | null;
  source_kind: string;
  source_id: string;
  awarded_at: number | string;
};

export class PostgresUserAchievementStore implements UserAchievementStore {
  constructor(private db: Database = businessDatabase()) {}

  list(userId: string, limit: number): Promise<UserAchievement[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          `SELECT ua.achievement_id,d.name,d.description,d.icon_ref,
                  ua.source_kind,ua.source_id,ua.awarded_at
           FROM user_achievements ua
           JOIN achievement_definitions d ON d.id=ua.achievement_id
           WHERE ua.user_id=$1 AND d.status<>'draft'
           ORDER BY ua.awarded_at DESC,ua.achievement_id
           LIMIT $2`,
          [userId, limit],
        )
      ).rows as AchievementRow[];
      return rows.map((row) => ({
        id: row.achievement_id,
        name: row.name,
        description: row.description,
        iconRef: row.icon_ref,
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        awardedAt: Number(row.awarded_at),
      }));
    });
  }
}
