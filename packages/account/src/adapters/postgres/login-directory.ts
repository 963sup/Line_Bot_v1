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

export async function readAccountLogins(
  sql: Sql,
  owners: ReadonlyArray<{ id: string; kind: "USER" | "ORGANIZATION" }>,
): Promise<LoginOwner[]> {
  if (!owners.length) return [];
  const unique = new Map<string, { id: string; kind: "USER" | "ORGANIZATION" }>();
  for (const owner of owners) unique.set(`${owner.id}:\0:${owner.kind}`, owner);
  const requested = [...unique.values()];
  return (
    await sql.query(
      `SELECT l.account_id AS id,l.account_kind AS kind,l.login
       FROM account_logins l
       JOIN unnest($1::text[], $2::text[]) AS requested(account_id, account_kind)
         ON requested.account_id=l.account_id AND requested.account_kind=l.account_kind
       ORDER BY l.account_id,l.account_kind`,
      [requested.map((owner) => owner.id), requested.map((owner) => owner.kind)],
    )
  ).rows as LoginOwner[];
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
