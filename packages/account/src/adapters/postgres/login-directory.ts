import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { LoginDirectoryStore, LoginOwner } from "../../application/ports/login-directory.js";

export async function resolveAccountLogin(sql: Sql, login: string): Promise<LoginOwner | null> {
  const row = (
    await sql.query(
      `SELECT account_id AS id,account_kind AS kind,login
       FROM account_logins
       WHERE login=$1`,
      [login],
    )
  ).rows[0] as LoginOwner | undefined;
  return row ?? null;
}

export async function readAccountLogin(
  sql: Sql,
  accountId: string,
  accountKind: "USER" | "ORGANIZATION",
): Promise<LoginOwner | null> {
  const row = (
    await sql.query(
      `SELECT account_id AS id,account_kind AS kind,login
       FROM account_logins
       WHERE account_id=$1 AND account_kind=$2`,
      [accountId, accountKind],
    )
  ).rows[0] as LoginOwner | undefined;
  return row ?? null;
}

export class PostgresLoginDirectoryStore implements LoginDirectoryStore {
  constructor(private db: Database = businessDatabase()) {}

  resolve(login: string): Promise<LoginOwner | null> {
    return this.db.transaction((sql) => resolveAccountLogin(sql, login));
  }
}
