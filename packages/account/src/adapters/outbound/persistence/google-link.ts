import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database } from "@line_bot_v1/platform/postgres";
import {
  nullableString,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  GoogleLinkTransaction,
  GoogleLinkTransactions,
} from "../../../contracts/output/google-link-transactions.js";
import type { UserTransactions } from "../../../contracts/output/user-transactions.js";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

function ownerRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    status: stringValue(row.status),
    status_version: numberValue(row.status_version),
    auth_user_id: nullableString(row.auth_user_id),
  };
}

function stagedLinkRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    google_id: nullableString(row.google_id),
    google_sub: nullableString(row.google_sub),
  };
}

function pendingLinkRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    google_email: nullableString(row.google_email),
    expires_at: numericValue(row.expires_at),
  };
}

function confirmedLinkRow(row: Record<string, unknown>) {
  return {
    google_id: nullableString(row.google_id),
    google_sub: nullableString(row.google_sub),
    google_email: nullableString(row.google_email),
  };
}

export class PostgresGoogleLinkPersistence implements GoogleLinkTransactions {
  constructor(
    private db: Database,
    private userTransactions: (scoped: Database) => UserTransactions,
  ) {}

  transact<T>(work: (transaction: GoogleLinkTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      return work({
        users: this.userTransactions({ transaction: (operation) => operation(sql) }),
        owner: async (provider, subject) => {
          const row = (
            await sql.query(
              "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF m",
              [provider, subject],
              ownerRow,
            )
          ).rows[0];
          return row
            ? {
                id: row.id,
                status: row.status,
                statusVersion: row.status_version,
                authUserId: row.auth_user_id,
              }
            : null;
        },
        expire: async (id, now) => {
          await sql.query("DELETE FROM google_link_requests WHERE user_id=$1 OR expires_at<=$2", [
            id,
            now,
          ]);
        },
        token: () => randomBytes(32).toString("base64url"),
        insert: async (request, token) => {
          await sql.query(
            "INSERT INTO google_link_requests(id,user_id,user_version,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), request.userId, request.userVersion, digest(token), request.expiresAt],
          );
        },
        stageRequest: async (token, now) => {
          const row = (
            await sql.query(
              "SELECT r.* FROM google_link_requests r JOIN users m ON m.id=r.user_id WHERE token_hash=$1 AND expires_at>$2 AND m.status='active' AND m.status_version=r.user_version FOR UPDATE OF r,m",
              [digest(token), now],
              stagedLinkRow,
            )
          ).rows[0];
          return row
            ? { id: row.id, googleId: row.google_id, googleSubject: row.google_sub }
            : null;
        },
        saveStage: async (id, google) => {
          await sql.query(
            "UPDATE google_link_requests SET google_id=$2,google_sub=$3,google_email=$4 WHERE id=$1",
            [id, google.id, google.sub, google.email],
          );
        },
        pending: async (id, version, now) => {
          const row = (
            await sql.query(
              "SELECT id,google_email,expires_at FROM google_link_requests WHERE user_id=$1 AND user_version=$2 AND expires_at>$3",
              [id, version, now],
              pendingLinkRow,
            )
          ).rows[0];
          return row
            ? { id: row.id, email: row.google_email, expiresAt: Number(row.expires_at) }
            : null;
        },
        confirmation: async (id, userId, version, now) => {
          const row = (
            await sql.query(
              "SELECT * FROM google_link_requests WHERE id=$1 AND user_id=$2 AND user_version=$3 AND expires_at>$4 FOR UPDATE",
              [id, userId, version, now],
              confirmedLinkRow,
            )
          ).rows[0];
          return row
            ? {
                googleId: row.google_id,
                googleSubject: row.google_sub,
                googleEmail: row.google_email,
              }
            : null;
        },
        drop: async (id) => {
          await sql.query("DELETE FROM google_link_requests WHERE id=$1", [id]);
        },
        cancel: async (id, userId) => {
          await sql.query("DELETE FROM google_link_requests WHERE id=$1 AND user_id=$2", [
            id,
            userId,
          ]);
        },
        linked: async (id) =>
          Boolean(
            (
              await sql.query(
                "SELECT 1 FROM user_identities WHERE user_id=$1 AND provider='google' FOR UPDATE",
                [id],
              )
            ).rows[0],
          ),
        unlink: async (id) => {
          await sql.query("DELETE FROM user_identities WHERE user_id=$1 AND provider='google'", [
            id,
          ]);
          await sql.query("UPDATE users SET auth_user_id=null WHERE id=$1", [id]);
        },
        clear: async (id) => {
          await sql.query("DELETE FROM google_link_requests WHERE user_id=$1", [id]);
        },
        audit: async (id, event, now) => {
          await sql.query("INSERT INTO user_events(user_id,type,at) VALUES($1,$2,$3)", [
            id,
            event,
            now,
          ]);
        },
      });
    });
  }
}
