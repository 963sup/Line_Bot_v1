import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type {
  UserProfile,
  UserProfileStore,
  UserProfileUpdate,
} from "../../application/ports/profile.js";
import { UserError } from "../../domain/user.js";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_ref: string | null;
  visibility: UserProfile["visibility"];
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

const profileColumns =
  "user_id,display_name,bio,avatar_ref,visibility,version,created_at,updated_at";

function profile(row: ProfileRow): UserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    avatarRef: row.avatar_ref,
    visibility: row.visibility,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function same(current: ProfileRow, update: UserProfileUpdate) {
  return (
    current.display_name === update.displayName &&
    current.bio === update.bio &&
    current.visibility === update.visibility
  );
}

export class PostgresUserProfileStore implements UserProfileStore {
  constructor(private db: Database = businessDatabase()) {}

  read(userId: string): Promise<UserProfile | null> {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(`SELECT ${profileColumns} FROM user_profiles WHERE user_id=$1`, [userId])
      ).rows[0] as ProfileRow | undefined;
      return row ? profile(row) : null;
    });
  }

  save(userId: string, update: UserProfileUpdate, at: number): Promise<UserProfile> {
    return this.db.transaction(async (sql) => {
      const user = (await sql.query("SELECT status FROM users WHERE id=$1 FOR SHARE", [userId]))
        .rows[0] as { status: string } | undefined;
      if (!user || user.status !== "active") {
        throw new UserError(403, "目前會員資格無法更新個人資料。");
      }

      const current = (
        await sql.query(`SELECT ${profileColumns} FROM user_profiles WHERE user_id=$1 FOR UPDATE`, [
          userId,
        ])
      ).rows[0] as ProfileRow | undefined;

      if (!current) {
        if (update.expectedVersion !== 0) {
          throw new UserError(409, "個人資料已更新，請重新載入。");
        }
        const created = (
          await sql.query(
            `INSERT INTO user_profiles(
               user_id,display_name,bio,avatar_ref,visibility,version,created_at,updated_at
             ) VALUES($1,$2,$3,NULL,$4,1,$5,$5)
             RETURNING ${profileColumns}`,
            [userId, update.displayName, update.bio, update.visibility, at],
          )
        ).rows[0] as ProfileRow;
        return profile(created);
      }

      if (current.version === update.expectedVersion + 1 && same(current, update)) {
        return profile(current);
      }
      if (current.version !== update.expectedVersion) {
        throw new UserError(409, "個人資料已更新，請重新載入。");
      }

      const saved = (
        await sql.query(
          `UPDATE user_profiles
           SET display_name=$2,bio=$3,visibility=$4,version=version+1,updated_at=$5
           WHERE user_id=$1
           RETURNING ${profileColumns}`,
          [userId, update.displayName, update.bio, update.visibility, at],
        )
      ).rows[0] as ProfileRow;
      return profile(saved);
    });
  }
}
