import { createHash } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  isRecord,
  nullableNumericValue,
  nullableString,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { UserProfileStatusChangeResult } from "../../../contracts/dto/user-profile-status.js";
import type {
  UserProfileStatusPersistence,
  UserProfileStatusTransaction,
} from "../../../contracts/output/user-profile-status.js";
import type {
  UserProfileStatus,
  UserProfileStatusStore,
} from "../../../contracts/repositories/user-profile-status.js";
import { UserError } from "../../../domain/user.js";
import {
  isVisibleUserProfileStatus,
  type UserProfileStatusFields,
} from "../../../domain/user-profile-status.js";

type StatusRow = {
  user_id: string;
  message: string | null;
  emoji: string | null;
  limited_availability: boolean;
  expires_at: number | string | null;
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

const columns =
  "user_id,message,emoji,limited_availability,expires_at,version,created_at,updated_at";

function statusRow(row: Record<string, unknown>): StatusRow {
  return {
    user_id: stringValue(row.user_id),
    message: nullableString(row.message),
    emoji: nullableString(row.emoji),
    limited_availability: booleanValue(row.limited_availability),
    expires_at: nullableNumericValue(row.expires_at),
    version: numberValue(row.version),
    created_at: numericValue(row.created_at),
    updated_at: numericValue(row.updated_at),
  };
}

function status(row: StatusRow): UserProfileStatus {
  return {
    userId: row.user_id,
    message: row.message,
    emoji: row.emoji,
    limitedAvailability: row.limited_availability,
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    version: row.version,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function fingerprint(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

function result(value: unknown): UserProfileStatusChangeResult {
  if (!isRecord(value)) throw new TypeError("Invalid UserProfileStatus receipt");
  const decoded = statusRow({
    user_id: value.userId,
    message: value.message,
    emoji: value.emoji,
    limited_availability: value.limitedAvailability,
    expires_at: value.expiresAt,
    version: value.version,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  });
  return { ...status(decoded), requestId: stringValue(value.requestId) };
}

class PostgresUserProfileStatusTransaction implements UserProfileStatusTransaction {
  constructor(
    private readonly sql: Sql,
    private readonly userId: string,
    private readonly requestId: string,
  ) {}

  async active() {
    const qualification = (
      await this.sql.query(
        "SELECT status FROM users WHERE id=$1 FOR SHARE",
        [this.userId],
        (row) => ({
          status: stringValue(row.status),
        }),
      )
    ).rows[0];
    return qualification?.status === "active";
  }

  async replay(payload: string) {
    const previous = (
      await this.sql.query(
        "SELECT fingerprint,result FROM user_profile_status_change_receipts WHERE user_id=$1 AND request_id=$2",
        [this.userId, this.requestId],
        (row) => ({ fingerprint: stringValue(row.fingerprint), result: row.result }),
      )
    ).rows[0];
    return previous
      ? { matches: previous.fingerprint === fingerprint(payload), result: result(previous.result) }
      : null;
  }

  async current() {
    const row = (
      await this.sql.query(
        `SELECT ${columns} FROM user_profile_statuses WHERE user_id=$1 FOR UPDATE`,
        [this.userId],
        statusRow,
      )
    ).rows[0];
    return row ? status(row) : null;
  }

  async save(
    fields: UserProfileStatusFields,
    expectedVersion: number,
    nextVersion: number,
    at: number,
  ) {
    const args = [
      this.userId,
      fields.message,
      fields.emoji,
      fields.limitedAvailability,
      fields.expiresAt,
      nextVersion,
      at,
      expectedVersion,
    ];
    const saved =
      expectedVersion === 0
        ? (
            await this.sql.query(
              `INSERT INTO user_profile_statuses(
                 user_id,message,emoji,limited_availability,expires_at,version,created_at,updated_at
               ) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING ${columns}`,
              args.slice(0, 7),
              statusRow,
            )
          ).rows[0]
        : (
            await this.sql.query(
              `UPDATE user_profile_statuses
               SET message=$2,emoji=$3,limited_availability=$4,expires_at=$5,
                   version=$6,updated_at=$7
               WHERE user_id=$1 AND version=$8 RETURNING ${columns}`,
              args,
              statusRow,
            )
          ).rows[0];
    if (!saved) throw new UserError(409, "狀態已更新，請重新載入。");
    return status(saved);
  }

  async record(payload: string, changed: UserProfileStatusChangeResult, at: number) {
    await this.sql.query(
      `INSERT INTO user_profile_status_change_receipts(
         user_id,request_id,fingerprint,result,at
       ) VALUES($1,$2,$3,$4::jsonb,$5)`,
      [this.userId, this.requestId, fingerprint(payload), JSON.stringify(changed), at],
    );
  }
}

export class PostgresUserProfileStatusPersistence
  implements UserProfileStatusStore, UserProfileStatusPersistence
{
  constructor(private readonly db: Database = businessDatabase()) {}

  read(userId: string): Promise<UserProfileStatus | null> {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT ${columns} FROM user_profile_statuses WHERE user_id=$1`,
          [userId],
          statusRow,
        )
      ).rows[0];
      return row ? status(row) : null;
    });
  }

  readPublic(userId: string, now: number): Promise<UserProfileStatus | null> {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT s.${columns.split(",").join(",s.")}
           FROM user_profile_statuses s JOIN users u ON u.id=s.user_id
           WHERE s.user_id=$1 AND u.status='active'`,
          [userId],
          statusRow,
        )
      ).rows[0];
      const value = row ? status(row) : null;
      return value && isVisibleUserProfileStatus(value, now) ? value : null;
    });
  }

  transact<T>(
    userId: string,
    requestId: string,
    work: (transaction: UserProfileStatusTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('shared')");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `user-profile-status:${userId}`,
      ]);
      return work(new PostgresUserProfileStatusTransaction(sql, userId, requestId));
    });
  }
}
