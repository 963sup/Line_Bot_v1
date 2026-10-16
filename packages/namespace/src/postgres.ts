import type { Sql } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  isRecord,
  literalValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { NamespaceStore } from "./contracts/namespace.js";
import {
  type NamespaceBinding,
  NamespaceError,
  type NamespaceKind,
  type NamespaceTarget,
} from "./domain/namespace.js";
import {
  NAMESPACE_PROFILES,
  type NamespaceFamily,
  type NamespaceScopeKind,
  normalizeNamespaceName,
  type ScopedNamespaceTargetKind,
} from "./domain/profiles.js";

export type ScopedNamespaceRef = Readonly<{
  family: NamespaceFamily;
  scopeKind: NamespaceScopeKind;
  scopeId: string;
}>;

type ScopedNamespaceTarget = Readonly<{
  targetKind: ScopedNamespaceTargetKind;
  targetId: string;
}>;

export type ScopedNamespaceWrite = ScopedNamespaceRef &
  ScopedNamespaceTarget &
  Readonly<{ name: string; at: number }>;

export type ScopedNamespaceRename = ScopedNamespaceWrite & Readonly<{ expectedName: string }>;

export type ScopedNamespaceRelease = ScopedNamespaceRef &
  ScopedNamespaceTarget &
  Readonly<{ expectedName: string; at: number }>;

export type ScopedNamespaceResolution = ScopedNamespaceTarget &
  Readonly<{
    name: string;
    currentName: string | null;
    alias: boolean;
  }>;

function decodeBinding(row: Record<string, unknown>): NamespaceBinding {
  return {
    id: stringValue(row.id),
    kind: literalValue(row.kind, ["USER", "ORGANIZATION"]),
    login: stringValue(row.login),
  };
}

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
      decodeBinding,
    )
  ).rows[0];
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
      decodeBinding,
    )
  ).rows;
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
      decodeBinding,
    )
  ).rows[0];
  return row ?? null;
}

function namespaceWriteError(error: unknown): never {
  const code = isRecord(error) ? error.code : undefined;
  if (code === "23505" || code === "40001") {
    throw new NamespaceError(409, "Namespace binding changed or is already claimed.");
  }
  if (code === "23503") throw new NamespaceError(404, "Namespace target does not exist.");
  if (code === "22023") throw new NamespaceError(400, "Namespace input or operation is invalid.");
  throw error;
}

function assertScopedInput(input: ScopedNamespaceRef & ScopedNamespaceTarget): void {
  const profile = NAMESPACE_PROFILES[input.family];
  if (
    !profile ||
    profile.scopeKind !== input.scopeKind ||
    !profile.targetKinds.includes(input.targetKind) ||
    !input.scopeId ||
    !input.targetId ||
    (input.scopeKind === "GLOBAL" && input.scopeId !== "global")
  ) {
    throw new NamespaceError(400, "Namespace family, scope, and target are inconsistent.");
  }
}

function assertAt(at: number): void {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new NamespaceError(400, "Namespace timestamp is invalid.");
  }
}

function decodeScopedResolution(row: Record<string, unknown>): ScopedNamespaceResolution {
  return {
    targetKind: literalValue(row.targetKind, [
      "USER",
      "ORGANIZATION",
      "ENTERPRISE",
      "REPOSITORY",
      "TEAM",
      "ENTERPRISE_TEAM",
      "LABEL",
      "ISSUE_TYPE",
      "DISCUSSION_CATEGORY",
      "PROJECT_FIELD",
      "FIELD_OPTION",
      "PROJECT_VIEW",
    ]),
    targetId: stringValue(row.targetId),
    name: stringValue(row.name),
    currentName: row.currentName === null ? null : stringValue(row.currentName),
    alias: booleanValue(row.alias),
  };
}

function scopedParams(input: ScopedNamespaceRef & ScopedNamespaceTarget): string[] {
  return [input.family, input.scopeKind, input.scopeId, input.targetKind, input.targetId];
}

export async function claimScopedName(
  sql: Sql,
  input: ScopedNamespaceWrite,
): Promise<ScopedNamespaceResolution> {
  assertScopedInput(input);
  assertAt(input.at);
  const name = normalizeNamespaceName(input.family, input.name);
  try {
    const row = (
      await sql.query(
        `SELECT target_kind AS "targetKind",target_id AS "targetId",
                name,current_name AS "currentName",alias
         FROM app_private.claim_scoped_namespace_name($1,$2,$3,$4,$5,$6,$7)`,
        [...scopedParams(input), name, input.at],
        decodeScopedResolution,
      )
    ).rows[0];
    if (!row) throw new NamespaceError(500, "Namespace claim returned no binding.");
    return row;
  } catch (error) {
    return namespaceWriteError(error);
  }
}

export async function renameScopedName(
  sql: Sql,
  input: ScopedNamespaceRename,
): Promise<ScopedNamespaceResolution> {
  assertScopedInput(input);
  if (!NAMESPACE_PROFILES[input.family].rename)
    throw new NamespaceError(400, "Namespace family does not support rename.");
  assertAt(input.at);
  const expectedName = normalizeNamespaceName(input.family, input.expectedName);
  const name = normalizeNamespaceName(input.family, input.name);
  try {
    const row = (
      await sql.query(
        `SELECT target_kind AS "targetKind",target_id AS "targetId",
                name,current_name AS "currentName",alias
         FROM app_private.rename_scoped_namespace_name($1,$2,$3,$4,$5,$6,$7,$8)`,
        [...scopedParams(input), expectedName, name, input.at],
        decodeScopedResolution,
      )
    ).rows[0];
    if (!row) throw new NamespaceError(500, "Namespace rename returned no binding.");
    return row;
  } catch (error) {
    return namespaceWriteError(error);
  }
}

export async function releaseScopedName(sql: Sql, input: ScopedNamespaceRelease): Promise<void> {
  assertScopedInput(input);
  if (!NAMESPACE_PROFILES[input.family].release)
    throw new NamespaceError(400, "Namespace family does not support release.");
  assertAt(input.at);
  const expectedName = normalizeNamespaceName(input.family, input.expectedName);
  try {
    await sql.query("SELECT app_private.release_scoped_namespace_name($1,$2,$3,$4,$5,$6,$7)", [
      ...scopedParams(input),
      expectedName,
      input.at,
    ]);
  } catch (error) {
    return namespaceWriteError(error);
  }
}

export async function resolveScopedName(
  sql: Sql,
  scope: ScopedNamespaceRef,
  name: unknown,
): Promise<ScopedNamespaceResolution | null> {
  const profile = NAMESPACE_PROFILES[scope.family];
  if (
    !profile ||
    profile.scopeKind !== scope.scopeKind ||
    !scope.scopeId ||
    (scope.scopeKind === "GLOBAL" && scope.scopeId !== "global")
  ) {
    throw new NamespaceError(400, "Namespace family and scope are inconsistent.");
  }
  let normalized: string;
  try {
    normalized = normalizeNamespaceName(scope.family, name);
  } catch (error) {
    if (error instanceof NamespaceError && error.status === 400) return null;
    throw error;
  }
  const row = (
    await sql.query(
      `SELECT target_kind AS "targetKind",target_id AS "targetId",
              name,current_name AS "currentName",alias
       FROM app_private.resolve_scoped_namespace_name($1,$2,$3,$4)`,
      [scope.family, scope.scopeKind, scope.scopeId, normalized],
      decodeScopedResolution,
    )
  ).rows[0];
  return row ?? null;
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
