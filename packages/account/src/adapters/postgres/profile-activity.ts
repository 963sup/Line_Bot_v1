import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type {
  UserContributionDay,
  UserProfileAchievement,
  UserProfileActivity,
  UserProfileActivityStore,
} from "../../application/ports/profile-activity.js";

type AchievementRow = {
  achievement_id: string;
  name: string;
  description: string;
  icon_ref: string | null;
  visibility: UserProfileAchievement["visibility"];
  awarded_at: number | string;
  source_kind: string;
};

type ContributionRow = {
  day: string;
  contribution_count: number | string;
};

export class PostgresUserProfileActivityStore implements UserProfileActivityStore {
  constructor(private db: Database = businessDatabase()) {}

  read(userId: string): Promise<UserProfileActivity> {
    return this.db.transaction(async (sql) => {
      const achievements = (
        await sql.query(
          `SELECT ua.achievement_id,d.name,d.description,d.icon_ref,
                  ua.visibility,ua.awarded_at,ua.source_kind
           FROM user_achievements ua
           JOIN achievement_definitions d ON d.id=ua.achievement_id
           WHERE ua.user_id=$1 AND d.status<>'draft'
           ORDER BY ua.awarded_at DESC,ua.achievement_id
           LIMIT 24`,
          [userId],
        )
      ).rows as AchievementRow[];

      const contributions = (
        await sql.query(
          `SELECT day,contribution_count
           FROM user_contribution_days
           WHERE user_id=$1 AND contribution_count>0
           ORDER BY day DESC
           LIMIT 90`,
          [userId],
        )
      ).rows as ContributionRow[];

      return {
        achievements: achievements.map((row) => ({
          id: row.achievement_id,
          name: row.name,
          description: row.description,
          iconRef: row.icon_ref,
          visibility: row.visibility,
          awardedAt: Number(row.awarded_at),
          sourceKind: row.source_kind,
        })),
        contributions: contributions.map(
          (row): UserContributionDay => ({
            day: row.day,
            count: Number(row.contribution_count),
          }),
        ),
      };
    });
  }
}
