import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { FollowItem, FollowStore } from "../../application/ports/follows.js";
import { UserError } from "../../domain/user.js";

export class PostgresFollowStore implements FollowStore {
  constructor(private db: Database = businessDatabase()) {}

  follow(followerUserId: string, followedUserId: string, at: number): Promise<void> {
    return this.db.transaction(async (sql) => {
      const target = (await sql.query("SELECT status FROM users WHERE id=$1", [followedUserId]))
        .rows[0] as { status: string } | undefined;
      if (!target || target.status !== "active") {
        throw new UserError(404, "找不到可追蹤的使用者。");
      }
      await sql.query(
        "INSERT INTO user_follows(follower_user_id,followed_user_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [followerUserId, followedUserId, at],
      );
    });
  }

  unfollow(followerUserId: string, followedUserId: string): Promise<void> {
    return this.db.transaction(async (sql) => {
      await sql.query(
        "DELETE FROM user_follows WHERE follower_user_id=$1 AND followed_user_id=$2",
        [followerUserId, followedUserId],
      );
    });
  }

  followers(userId: string): Promise<FollowItem[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          "SELECT follower_user_id AS user_id,created_at FROM user_follows WHERE followed_user_id=$1 ORDER BY created_at DESC,follower_user_id",
          [userId],
        )
      ).rows as Array<{ user_id: string; created_at: number | string }>;
      return rows.map((row) => ({ userId: row.user_id, followedAt: Number(row.created_at) }));
    });
  }

  following(userId: string): Promise<FollowItem[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          "SELECT followed_user_id AS user_id,created_at FROM user_follows WHERE follower_user_id=$1 ORDER BY created_at DESC,followed_user_id",
          [userId],
        )
      ).rows as Array<{ user_id: string; created_at: number | string }>;
      return rows.map((row) => ({ userId: row.user_id, followedAt: Number(row.created_at) }));
    });
  }
}
