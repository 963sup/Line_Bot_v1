import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { nullableString, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type { FollowItem, FollowStore } from "../contracts/output/follows.js";
import { requireActiveUser, requireFollowableUser } from "../domain/user.js";
import { readUserQualification } from "./qualification.js";

function followRow(row: Record<string, unknown>) {
  return {
    user_id: stringValue(row.user_id),
    created_at: numericValue(row.created_at),
    login: nullableString(row.login),
  };
}

export class PostgresFollowStore implements FollowStore {
  constructor(private db: Database = businessDatabase()) {}

  follow(followerUserId: string, followedUserId: string, at: number): Promise<void> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
      const users = new Map<string, Awaited<ReturnType<typeof readUserQualification>>>();
      for (const id of [...new Set([followerUserId, followedUserId])].sort()) {
        users.set(id, await readUserQualification(sql, id, "share"));
      }
      requireActiveUser(users.get(followerUserId) ?? null);
      requireFollowableUser(users.get(followedUserId) ?? null);
      await sql.query(
        "INSERT INTO user_follows(follower_user_id,followed_user_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [followerUserId, followedUserId, at],
      );
    });
  }

  unfollow(followerUserId: string, followedUserId: string): Promise<void> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
      requireActiveUser(await readUserQualification(sql, followerUserId, "share"));
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
          `SELECT f.follower_user_id AS user_id,f.created_at,p.login
           FROM user_follows f
           LEFT JOIN user_namespace_projection p
             ON p.id=f.follower_user_id AND p.status='active'
           WHERE f.followed_user_id=$1
           ORDER BY f.created_at DESC,f.follower_user_id`,
          [userId],
          followRow,
        )
      ).rows;
      return rows.map((row) => ({
        userId: row.user_id,
        followedAt: Number(row.created_at),
        login: row.login,
      }));
    });
  }

  following(userId: string): Promise<FollowItem[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          `SELECT f.followed_user_id AS user_id,f.created_at,p.login
           FROM user_follows f
           LEFT JOIN user_namespace_projection p
             ON p.id=f.followed_user_id AND p.status='active'
           WHERE f.follower_user_id=$1
           ORDER BY f.created_at DESC,f.followed_user_id`,
          [userId],
          followRow,
        )
      ).rows;
      return rows.map((row) => ({
        userId: row.user_id,
        followedAt: Number(row.created_at),
        login: row.login,
      }));
    });
  }
}
