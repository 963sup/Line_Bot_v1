import type { Sql } from "@line_bot_v1/platform/postgres";
import type { NamespaceStore } from "./contracts/namespace.js";
import {
  type NamespaceBinding,
  NamespaceError,
  type NamespaceKind,
  type NamespaceTarget,
} from "./domain/namespace.js";

export async function resolveAccountLogin(
  sql: Sql,
  login: string,
): Promise<NamespaceBinding | null> {
  const row = (
    await sql.query(
      `SELECT account_id AS id,account_kind AS kind,login
       FROM account_logins
       WHERE login=$1`,
      [login],
    )
  ).rows[0] as NamespaceBinding | undefined;
  return row ?? null;
}

export async function readAccountLogins(
  sql: Sql,
  owners: readonly NamespaceTarget[],
): Promise<NamespaceBinding[]> {
  if (!owners.length) return [];
  const unique = new Map<string, NamespaceTarget>();
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
  ).rows as NamespaceBinding[];
}

export async function readAccountLogin(
  sql: Sql,
  accountId: string,
  accountKind: NamespaceKind,
): Promise<NamespaceBinding | null> {
  const row = (
    await sql.query(
      `SELECT account_id AS id,account_kind AS kind,login
       FROM account_logins
       WHERE account_id=$1 AND account_kind=$2`,
      [accountId, accountKind],
    )
  ).rows[0] as NamespaceBinding | undefined;
  return row ?? null;
}

function namespaceWriteError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "23505" || code === "40001") {
    throw new NamespaceError(409, "Account login changed or is already claimed.");
  }
  if (code === "23503") throw new NamespaceError(404, "Namespace target does not exist.");
  if (code === "22023") throw new NamespaceError(400, "Account login is invalid or reserved.");
  throw error;
}

export class PostgresNamespaceStore implements NamespaceStore {
  constructor(private sql: Sql) {}

  resolve(login: string) {
    return resolveAccountLogin(this.sql, login);
  }

  read(target: NamespaceTarget) {
    return readAccountLogin(this.sql, target.id, target.kind);
  }

  readMany(targets: readonly NamespaceTarget[]) {
    return readAccountLogins(this.sql, targets);
  }

  async claim(target: NamespaceTarget, login: string, at: number) {
    try {
      await this.sql.query("SELECT app_private.claim_account_login($1,$2,$3,$4)", [
        target.id,
        target.kind,
        login,
        at,
      ]);
      const binding = await this.read(target);
      if (!binding) throw new NamespaceError(500, "Namespace claim did not produce a binding.");
      return binding;
    } catch (error) {
      return namespaceWriteError(error);
    }
  }

  async rename(target: NamespaceTarget, expectedLogin: string, login: string, at: number) {
    try {
      await this.sql.query("SELECT app_private.rename_account_login($1,$2,$3,$4,$5)", [
        target.id,
        target.kind,
        expectedLogin,
        login,
        at,
      ]);
      const binding = await this.read(target);
      if (!binding) throw new NamespaceError(500, "Namespace rename lost its binding.");
      return binding;
    } catch (error) {
      return namespaceWriteError(error);
    }
  }
}
