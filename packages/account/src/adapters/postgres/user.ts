import { randomUUID } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { VerifiedGoogleIdentity } from "../../application/ports/identity-provider.js";
import type { UserRepository } from "../../application/ports/user-repository.js";
import { type User, UserError } from "../../domain/user.js";
import { type AccountAdministrationGuard, unavailableAccountAuthorization } from "./authority.js";
import { qualifyActiveUser } from "./qualification.js";

type StoredUser = User & { auth_user_id: string | null };
const user = (row: Record<string, any>): StoredUser =>
  ({ ...row, createdAt: Number(row.createdAt) }) as StoredUser;

export class PostgresUserStore implements UserRepository {
  constructor(
    private db: Database = businessDatabase(),
    private administration: AccountAdministrationGuard = unavailableAccountAuthorization,
  ) {}

  private async getFrom(sql: Sql, id: string, lock = false) {
    const row = (
      await sql.query(`SELECT * FROM users WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])
    ).rows[0];
    if (!row) throw new UserError(404, "會員不存在。");
    return user(row);
  }

  get(id: string) {
    return this.db.transaction((sql) => this.getFrom(sql, id));
  }

  publicByLogin(login: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT u.id,l.login
           FROM account_logins l
           JOIN users u ON u.id=l.account_id
           WHERE l.account_kind='USER' AND l.login=$1 AND u.status='active'`,
          [login],
        )
      ).rows[0] as { id: string; login: string } | undefined;
      return row ?? null;
    });
  }

  updateLogin(userId: string, login: string, now: number) {
    return this.db.transaction(async (sql) => {
      const current = await this.getFrom(sql, userId, true);
      if (current.status !== "active") throw new UserError(403, "目前會員資格無法更新登入名稱。");
      try {
        await sql.query("SELECT app_private.set_account_login($1,'USER',$2,$3)", [
          userId,
          login,
          now,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new UserError(409, "登入名稱已被使用。");
        }
        throw error;
      }
      return this.viewFrom(sql, userId);
    });
  }

  find(provider: string, subject: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2",
          [provider, subject],
        )
      ).rows[0];
      return row ? user(row) : null;
    });
  }

  private async audit(sql: Sql, id: string, type: string, now = Date.now()) {
    await sql.query("INSERT INTO user_events(user_id,type,at) VALUES($1,$2,$3)", [id, type, now]);
  }

  /** Separate LINE registration and restoration; retries preserve the same User and history. */
  registerLine(provider: string, subject: string, login: string, now = Date.now()) {
    return this.changeLineUser(provider, subject, "register", login, now);
  }

  restoreLine(provider: string, subject: string, now = Date.now()) {
    return this.changeLineUser(provider, subject, "restore", null, now);
  }

  private async changeLineUser(
    provider: string,
    subject: string,
    operation: "register" | "restore",
    login: string | null,
    now: number,
  ) {
    if (!/^line:[\w-]{1,80}$/.test(provider) || !/^U[a-f0-9]{32}$/i.test(subject)) {
      throw new UserError(400, "LINE 身分不正確。");
    }
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${provider}:${subject}`,
      ]);
      const row = (
        await sql.query(
          "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF m",
          [provider, subject],
        )
      ).rows[0];
      if (row) {
        const m = user(row);
        if (m.status === "suspended") throw new UserError(403, "會員已停權。");
        if (operation === "register") {
          if (!login) throw new UserError(400, "登入名稱格式不正確。");
          const currentLogin = (
            await sql.query(
              "SELECT login FROM account_logins WHERE account_id=$1 AND account_kind='USER'",
              [m.id],
            )
          ).rows[0] as { login: string } | undefined;
          if (currentLogin && currentLogin.login !== login) {
            throw new UserError(409, "此 User 已使用其他登入名稱。");
          }
          if (!currentLogin) {
            try {
              await sql.query("SELECT app_private.set_account_login($1,'USER',$2,$3)", [
                m.id,
                login,
                now,
              ]);
            } catch (error) {
              if ((error as { code?: string }).code === "23505") {
                throw new UserError(409, "登入名稱已被使用。");
              }
              throw error;
            }
          }
        }
        if (m.status !== "active") {
          if (operation === "register") {
            throw new UserError(409, "會員已存在，請使用恢復功能。");
          }
          await sql.query("UPDATE users SET status='active' WHERE id=$1", [m.id]);
          await this.audit(sql, m.id, "membership_resumed", now);
        }
        return this.viewFrom(sql, m.id);
      }
      if (operation === "restore") throw new UserError(404, "會員尚未註冊。");
      const m: StoredUser = {
        id: randomUUID(),
        status: "active",
        createdAt: now,
        auth_user_id: null,
      };
      await sql.query('INSERT INTO users(id,status,"createdAt") VALUES($1,$2,$3)', [
        m.id,
        m.status,
        now,
      ]);
      if (!login) throw new UserError(400, "登入名稱格式不正確。");
      try {
        await sql.query("SELECT app_private.set_account_login($1,'USER',$2,$3)", [
          m.id,
          login,
          now,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new UserError(409, "登入名稱已被使用。");
        }
        throw error;
      }
      await sql.query("INSERT INTO user_identities(provider,subject,user_id) VALUES($1,$2,$3)", [
        provider,
        subject,
        m.id,
      ]);
      await this.audit(sql, m.id, "registered", now);
      return this.viewFrom(sql, m.id);
    });
  }

  /** Both proofs are verified by the server before this explicit confirmation. Never merge by email. */
  async bind(provider: string, subject: string, google: VerifiedGoogleIdentity, now = Date.now()) {
    if (!/^line:[\w-]{1,80}$/.test(provider) || !/^U[a-f0-9]{32}$/i.test(subject)) {
      throw new UserError(400, "LINE 身分不正確。");
    }
    try {
      return await this.db.transaction(async (sql) => {
        await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
        await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${provider}:${subject}`,
        ]);
        const row = (
          await sql.query(
            "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF m",
            [provider, subject],
          )
        ).rows[0];
        if (!row) throw new UserError(403, "請使用已註冊的 LINE 會員。");
        const m = user(row);
        if (m.status === "suspended") throw new UserError(403, "會員已停權。");
        const old = (
          await sql.query(
            "SELECT subject FROM user_identities WHERE user_id=$1 AND provider='google'",
            [m.id],
          )
        ).rows[0];
        if (
          (m.auth_user_id && m.auth_user_id !== google.id) ||
          (old && old.subject !== google.sub)
        ) {
          throw new UserError(409, "此 LINE 已綁定其他 Google 帳號，請使用原帳號登入。");
        }
        const other = (
          await sql.query(
            "SELECT user_id FROM user_identities WHERE provider='google' AND subject=$1",
            [google.sub],
          )
        ).rows[0];
        if (other && other.user_id !== m.id) {
          throw new UserError(409, "此 Google 帳號已綁定其他 LINE 會員。");
        }
        await sql.query(
          "INSERT INTO user_identities(provider,subject,user_id,email) VALUES('google',$1,$2,$3) ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email",
          [google.sub, m.id, google.email],
        );
        await sql.query("UPDATE users SET auth_user_id=$2,status='active' WHERE id=$1", [
          m.id,
          google.id,
        ]);
        if (m.auth_user_id !== google.id || m.status !== "active") {
          await this.audit(sql, m.id, "supabase_linked", now);
        }
        return { ...m, status: "active" as const, auth_user_id: google.id };
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        throw new UserError(409, "帳號已被綁定，請重新載入。");
      }
      throw e;
    }
  }

  googleIdentity(id: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          "SELECT subject,email FROM user_identities WHERE user_id=$1 AND provider='google'",
          [id],
        )
      ).rows[0];
      return row ? { sub: String(row.subject), email: String(row.email) } : null;
    });
  }

  private async viewFrom(sql: Sql, id: string) {
    const m = await this.getFrom(sql, id);
    const login = (
      await sql.query(
        "SELECT login FROM account_logins WHERE account_id=$1 AND account_kind='USER'",
        [id],
      )
    ).rows[0] as { login: string } | undefined;
    const g = (
      await sql.query("SELECT email FROM user_identities WHERE user_id=$1 AND provider='google'", [
        id,
      ])
    ).rows[0];
    return {
      id: m.id,
      status: m.status,
      createdAt: m.createdAt,
      login: login?.login ?? null,
      googleEmail: g?.email ?? null,
    };
  }

  view(id: string) {
    return this.db.transaction((sql) => this.viewFrom(sql, id));
  }

  pause(id: string, authId?: string) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      await this.administration.protectPermissionAdministrator(sql, id);
      await qualifyActiveUser(sql, id, authId);
      await sql.query("UPDATE users SET status='paused' WHERE id=$1", [id]);
      await this.audit(sql, id, "membership_deactivated");
      return this.viewFrom(sql, id);
    });
  }

  suspend(id: string) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      await this.administration.protectPermissionAdministrator(sql, id);
      await this.getFrom(sql, id, true);
      await sql.query("UPDATE users SET status='suspended' WHERE id=$1", [id]);
      await this.audit(sql, id, "suspended");
    });
  }
}
