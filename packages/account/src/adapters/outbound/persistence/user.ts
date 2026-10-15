import { randomUUID } from "node:crypto";
import { claimNamespace, NamespaceError, renameNamespace } from "@line_bot_v1/namespace";
import { PostgresNamespaceStore, readAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  UserTransaction,
  UserTransactions,
} from "../../../contracts/output/user-transactions.js";
import { type User, UserError } from "../../../domain/user.js";
import {
  type AccountAdministrationGuard,
  unavailableAccountAuthorization,
} from "../../../postgres/authority.js";
import { qualifyActiveUser } from "../../../postgres/qualification.js";

type StoredUser = User & { auth_user_id: string | null };
type UserViewRow = {
  id: string;
  status: User["status"];
  createdAt: number | string;
  login: string | null;
  google_email: string | null;
};
type StoredUserRow = Omit<StoredUser, "createdAt"> & { createdAt: number | string };
const user = (row: StoredUserRow): StoredUser => ({ ...row, createdAt: Number(row.createdAt) });
const userView = (row: UserViewRow) => {
  if (!row.login) throw new UserError(500, "User 登入名稱資料不完整。");
  return {
    id: row.id,
    status: row.status,
    createdAt: Number(row.createdAt),
    login: row.login,
    googleEmail: row.google_email,
  };
};

function storedUserRow(row: Record<string, unknown>): StoredUserRow {
  return {
    id: stringValue(row.id),
    status: literalValue(row.status, ["paused", "active", "suspended"]),
    createdAt: numericValue(row.createdAt),
    auth_user_id: nullableString(row.auth_user_id),
  };
}

function publicUserRow(row: Record<string, unknown>) {
  return { id: stringValue(row.id), login: stringValue(row.login) };
}

function identityProjectionRow(row: Record<string, unknown>) {
  return {
    identity_user_id: stringValue(row.identity_user_id),
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    login: row.login,
    google_email: row.google_email,
  };
}

function projectedUser(row: ReturnType<typeof identityProjectionRow>): UserViewRow {
  if (
    typeof row.id !== "string" ||
    (row.status !== "paused" && row.status !== "active" && row.status !== "suspended") ||
    (typeof row.createdAt !== "number" && typeof row.createdAt !== "string") ||
    typeof row.login !== "string" ||
    (row.google_email !== null && typeof row.google_email !== "string")
  ) {
    throw new UserError(500, "User 帳號識別資料不完整。");
  }
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    login: row.login,
    google_email: row.google_email,
  };
}

function subjectRow(row: Record<string, unknown>) {
  return { subject: stringValue(row.subject) };
}

function userIdRow(row: Record<string, unknown>) {
  return { user_id: stringValue(row.user_id) };
}

function googleIdentityRow(row: Record<string, unknown>) {
  return { subject: stringValue(row.subject), email: stringValue(row.email) };
}

function userViewRow(row: Record<string, unknown>): UserViewRow {
  return {
    id: stringValue(row.id),
    status: literalValue(row.status, ["paused", "active", "suspended"]),
    createdAt: numericValue(row.createdAt),
    login: nullableString(row.login),
    google_email: nullableString(row.google_email),
  };
}

function hasPostgresCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export class PostgresUserPersistence implements UserTransactions {
  constructor(
    private db: Database = businessDatabase(),
    private administration: AccountAdministrationGuard = unavailableAccountAuthorization,
  ) {}

  private async getFrom(sql: Sql, id: string, lock = false) {
    const row = (
      await sql.query(
        `SELECT * FROM users WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
        [id],
        storedUserRow,
      )
    ).rows[0];
    if (!row) throw new UserError(404, "會員不存在。");
    return user(row);
  }

  get(id: string) {
    return this.db.transaction((sql) => this.getFrom(sql, id));
  }

  publicById(userId: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT id,login FROM user_namespace_projection
          WHERE id=$1 AND status='active'`,
          [userId],
          publicUserRow,
        )
      ).rows[0];
      if (!row) return null;
      if (!row.login) throw new UserError(500, "User 登入名稱資料不完整。");
      return row;
    });
  }

  find(provider: string, subject: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2",
          [provider, subject],
          storedUserRow,
        )
      ).rows[0];
      return row ? user(row) : null;
    });
  }

  viewByIdentity(provider: string, subject: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          `SELECT i.user_id AS identity_user_id,
                  p.id,p.status,p."createdAt",p.login,p.google_email
           FROM user_identities i
           LEFT JOIN user_namespace_projection p ON p.id=i.user_id
          WHERE i.provider=$1 AND i.subject=$2`,
          [provider, subject],
          identityProjectionRow,
        )
      ).rows[0];
      if (!row) return null;
      return userView(projectedUser(row));
    });
  }

  private scope(sql: Sql): UserTransaction {
    const asUser = (value: User): User => ({
      id: value.id,
      status: value.status,
      createdAt: value.createdAt,
    });
    const namespace = async (work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        if (error instanceof NamespaceError) throw new UserError(error.status, error.message);
        throw error;
      }
    };
    return {
      lineUser: async (provider, subject) => {
        const row = (
          await sql.query(
            "SELECT m.* FROM users m JOIN user_identities i ON i.user_id=m.id WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF m",
            [provider, subject],
            storedUserRow,
          )
        ).rows[0];
        if (!row) return null;
        const current = user(row);
        return { user: asUser(current), authUserId: current.auth_user_id };
      },
      user: async (id) => asUser(await this.getFrom(sql, id, true)),
      qualify: async (id, authId) => asUser(await qualifyActiveUser(sql, id, authId)),
      protectAdministrator: (id) => this.administration.protectPermissionAdministrator(sql, id),
      newId: randomUUID,
      insert: async (next) => {
        await sql.query('INSERT INTO users(id,status,"createdAt") VALUES($1,$2,$3)', [
          next.id,
          next.status,
          next.createdAt,
        ]);
      },
      saveStatus: async (next) => {
        await sql.query("UPDATE users SET status=$2 WHERE id=$1", [next.id, next.status]);
      },
      login: async (id) => (await readAccountLogin(sql, id, "USER"))?.login ?? null,
      claimLogin: (id, login, now) =>
        namespace(() =>
          claimNamespace(new PostgresNamespaceStore(sql), { id, kind: "USER" }, login, now),
        ),
      renameLogin: (id, expectedLogin, login, now) =>
        namespace(() =>
          renameNamespace(
            new PostgresNamespaceStore(sql),
            { id, kind: "USER" },
            expectedLogin,
            login,
            now,
          ),
        ),
      recordLineIdentity: async (id, provider, subject) => {
        await sql.query("INSERT INTO user_identities(provider,subject,user_id) VALUES($1,$2,$3)", [
          provider,
          subject,
          id,
        ]);
      },
      googleSubject: async (id) =>
        (
          await sql.query(
            "SELECT subject FROM user_identities WHERE user_id=$1 AND provider='google'",
            [id],
            subjectRow,
          )
        ).rows[0]?.subject ?? null,
      googleOwner: async (subject) =>
        (
          await sql.query(
            "SELECT user_id FROM user_identities WHERE provider='google' AND subject=$1",
            [subject],
            userIdRow,
          )
        ).rows[0]?.user_id ?? null,
      saveGoogleBinding: async (next, google) => {
        await sql.query(
          "INSERT INTO user_identities(provider,subject,user_id,email) VALUES('google',$1,$2,$3) ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email",
          [google.sub, next.id, google.email],
        );
        await sql.query("UPDATE users SET auth_user_id=$2,status=$3 WHERE id=$1", [
          next.id,
          google.id,
          next.status,
        ]);
      },
      audit: async (id, event, now) => {
        await sql.query("INSERT INTO user_events(user_id,type,at) VALUES($1,$2,$3)", [
          id,
          event,
          now,
        ]);
      },
      view: (id) => this.viewFrom(sql, id),
    };
  }

  identity<T>(
    provider: string,
    subject: string,
    work: (transaction: UserTransaction) => Promise<T>,
  ) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${provider}:${subject}`,
      ]);
      return work(this.scope(sql));
    });
  }

  async binding<T>(
    provider: string,
    subject: string,
    work: (transaction: UserTransaction) => Promise<T>,
  ) {
    try {
      return await this.identity(provider, subject, work);
    } catch (error) {
      if (hasPostgresCode(error, "23505")) throw new UserError(409, "帳號已被綁定，請重新載入。");
      throw error;
    }
  }

  lifecycle<T>(work: (transaction: UserTransaction) => Promise<T>) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      return work(this.scope(sql));
    });
  }

  rename<T>(work: (transaction: UserTransaction) => Promise<T>) {
    return this.db.transaction((sql) => work(this.scope(sql)));
  }

  googleIdentity(id: string) {
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.query(
          "SELECT subject,email FROM user_identities WHERE user_id=$1 AND provider='google'",
          [id],
          googleIdentityRow,
        )
      ).rows[0];
      return row ? { sub: row.subject, email: row.email } : null;
    });
  }

  private async viewFrom(sql: Sql, id: string) {
    const row = (
      await sql.query(
        `SELECT id,status,"createdAt",login,google_email
         FROM user_namespace_projection WHERE id=$1`,
        [id],
        userViewRow,
      )
    ).rows[0];
    if (!row) throw new UserError(404, "會員不存在。");
    return userView(row);
  }

  view(id: string) {
    return this.db.transaction((sql) => this.viewFrom(sql, id));
  }
}
