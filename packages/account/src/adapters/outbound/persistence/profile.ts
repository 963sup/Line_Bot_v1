import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  UserProfile,
  UserProfileStore,
  UserProfileUpdate,
} from "../../../contracts/repositories/profile.js";
import {
  decideProfileSave,
  requireProfileWriter,
  USER_PROFILE_VISIBILITIES,
} from "../../../domain/profile.js";
import { UserError } from "../../../domain/user.js";

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

function profileRow(row: Record<string, unknown>): ProfileRow {
  return {
    user_id: stringValue(row.user_id),
    display_name: nullableString(row.display_name),
    bio: nullableString(row.bio),
    avatar_ref: nullableString(row.avatar_ref),
    visibility: literalValue(row.visibility, USER_PROFILE_VISIBILITIES),
    version: numberValue(row.version),
    created_at: numericValue(row.created_at),
    updated_at: numericValue(row.updated_at),
  };
}

function statusRow(row: Record<string, unknown>) {
  return { status: stringValue(row.status) };
}

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

export class PostgresUserProfileStore implements UserProfileStore {
  constructor(private db: Database = businessDatabase()) {}

  read(userId: string): Promise<UserProfile | null> {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT ${profileColumns} FROM user_profiles WHERE user_id=$1`,
          [userId],
          profileRow,
        )
      ).rows[0];
      return row ? profile(row) : null;
    });
  }

  save(userId: string, update: UserProfileUpdate, at: number): Promise<UserProfile> {
    return this.db.transaction(async (sql) => {
      const user = (
        await sql.query("SELECT status FROM users WHERE id=$1 FOR SHARE", [userId], statusRow)
      ).rows[0];
      requireProfileWriter(user?.status ?? null);

      const current = (
        await sql.query(
          `SELECT ${profileColumns} FROM user_profiles WHERE user_id=$1 FOR UPDATE`,
          [userId],
          profileRow,
        )
      ).rows[0];

      const decision = decideProfileSave(
        current ? profile(current) : null,
        update,
        update.expectedVersion,
      );
      if (current && decision === "retry") return profile(current);
      if (decision === "create") {
        const created = (
          await sql.query(
            `INSERT INTO user_profiles(
               user_id,display_name,bio,avatar_ref,visibility,version,created_at,updated_at
            ) VALUES($1,$2,$3,NULL,$4,1,$5,$5)
             RETURNING ${profileColumns}`,
            [userId, update.displayName, update.bio, update.visibility, at],
            profileRow,
          )
        ).rows[0];
        if (!created) throw new UserError(500, "個人資料建立結果不完整。");
        return profile(created);
      }

      const saved = (
        await sql.query(
          `UPDATE user_profiles
           SET display_name=$2,bio=$3,visibility=$4,version=version+1,updated_at=$5
           WHERE user_id=$1
           RETURNING ${profileColumns}`,
          [userId, update.displayName, update.bio, update.visibility, at],
          profileRow,
        )
      ).rows[0];
      if (!saved) throw new UserError(500, "個人資料更新結果不完整。");
      return profile(saved);
    });
  }
}
