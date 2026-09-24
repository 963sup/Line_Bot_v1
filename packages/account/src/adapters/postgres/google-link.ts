import { createHash, randomBytes, randomUUID } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { VerifiedGoogleIdentity } from "../../application/ports/identity-provider.js";
import type { GoogleLinkRepository } from "../../application/ports/user-repository.js";
import { UserError } from "../../domain/user.js";
import { PostgresUserStore } from "./user.js";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const expired = () => new UserError(410, "綁定請求已失效，請從帳號設定重新開始。");

export class PostgresGoogleLinkStore implements GoogleLinkRepository {
  constructor(private db: Database = businessDatabase()) {}

  private async lock(sql: Sql) {
    await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
  }

  private async owner(sql: Sql, provider: string, subject: string) {
    const row = (
      await sql.query(
        "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF m",
        [provider, subject],
      )
    ).rows[0];
    if (!row || row.status !== "active") {
      throw new UserError(403, "請使用已啟用的原 LINE 會員。");
    }
    return row;
  }

  async start(provider: string, subject: string, now: number) {
    return this.db.transaction(async (sql) => {
      await this.lock(sql);
      const user = await this.owner(sql, provider, subject);
      if (user.auth_user_id) throw new UserError(409, "此使用者已綁定 Google。");
      await sql.query("DELETE FROM google_link_requests WHERE user_id=$1 OR expires_at<=$2", [
        user.id,
        now,
      ]);
      const token = randomBytes(32).toString("base64url");
      await sql.query(
        "INSERT INTO google_link_requests(id,user_id,user_version,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), user.id, user.status_version, digest(token), now + 10 * 60_000],
      );
      return { token };
    });
  }

  async stage(token: string, google: VerifiedGoogleIdentity, now: number) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw expired();
    await this.db.transaction(async (sql) => {
      await this.lock(sql);
      const row = (
        await sql.query(
          "SELECT r.* FROM google_link_requests r JOIN users m ON m.id=r.user_id WHERE token_hash=$1 AND expires_at>$2 AND m.status='active' AND m.status_version=r.user_version FOR UPDATE OF r,m",
          [digest(token), now],
        )
      ).rows[0];
      if (!row) throw expired();
      if (row.google_id) {
        if (row.google_id === google.id && row.google_sub === google.sub) return;
        throw new UserError(409, "此請求已有 Google 帳號，請從帳號設定重新開始。");
      }
      await sql.query(
        "UPDATE google_link_requests SET google_id=$2,google_sub=$3,google_email=$4 WHERE id=$1",
        [row.id, google.id, google.sub, google.email],
      );
    });
  }

  async pending(provider: string, subject: string, now: number) {
    return this.db.transaction(async (sql) => {
      await this.lock(sql);
      const user = await this.owner(sql, provider, subject);
      const row = (
        await sql.query(
          "SELECT id,google_email,expires_at FROM google_link_requests WHERE user_id=$1 AND user_version=$2 AND expires_at>$3",
          [user.id, user.status_version, now],
        )
      ).rows[0];
      return row
        ? {
            id: String(row.id),
            email: row.google_email as string | null,
            expiresAt: Number(row.expires_at),
          }
        : null;
    });
  }

  async confirm(provider: string, subject: string, id: string, now: number) {
    await this.db.transaction(async (sql) => {
      await this.lock(sql);
      const user = await this.owner(sql, provider, subject);
      const row = (
        await sql.query(
          "SELECT * FROM google_link_requests WHERE id=$1 AND user_id=$2 AND user_version=$3 AND expires_at>$4 FOR UPDATE",
          [id, user.id, user.status_version, now],
        )
      ).rows[0];
      if (!row) throw expired();
      if (!row.google_id) throw new UserError(409, "請先完成 Google 登入。");
      const users = new PostgresUserStore({ transaction: (work) => work(sql) });
      await users.bind(
        provider,
        subject,
        { id: row.google_id, sub: row.google_sub, email: row.google_email },
        now,
      );
      await sql.query("DELETE FROM google_link_requests WHERE id=$1", [id]);
    });
  }

  async cancel(provider: string, subject: string, id: string) {
    await this.db.transaction(async (sql) => {
      await this.lock(sql);
      const user = await this.owner(sql, provider, subject);
      await sql.query("DELETE FROM google_link_requests WHERE id=$1 AND user_id=$2", [id, user.id]);
    });
  }

  async unlink(provider: string, subject: string, now: number) {
    await this.db.transaction(async (sql) => {
      await this.lock(sql);
      const user = await this.owner(sql, provider, subject);
      const linked = (
        await sql.query(
          "SELECT 1 FROM user_identities WHERE user_id=$1 AND provider='google' FOR UPDATE",
          [user.id],
        )
      ).rows[0];
      if (!linked) throw new UserError(409, "目前沒有可解除的 Google 綁定。");
      await sql.query("DELETE FROM user_identities WHERE user_id=$1 AND provider='google'", [
        user.id,
      ]);
      await sql.query("UPDATE users SET auth_user_id=null WHERE id=$1", [user.id]);
      await sql.query("DELETE FROM google_link_requests WHERE user_id=$1", [user.id]);
      await sql.query("INSERT INTO user_events(user_id,type,at) VALUES($1,'google_unlinked',$2)", [
        user.id,
        now,
      ]);
    });
  }
}
