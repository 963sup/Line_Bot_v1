import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadRootEnv } from "../runtime/load-env.mjs";
import { runSupabaseCli } from "./cli-adapter.mjs";
import {
  assertIdentifierAuthorityCounts,
  assertIdentifierAuthorityMarker,
  assertIdentifierCutoverRevision,
  classifyIdentifierAuthorityState,
  identifierAuthorityCatalogSql,
  identifierAuthorityCountsSql,
  identifierAuthorityMarkerSql,
  identifierCutoverTransactionSql,
  identifierRuntimeActivationTransactionSql,
} from "./identifier-cutover.mjs";
import { executeSql, queryRows, withPostgres } from "./postgres.mjs";
import {
  assertValidatedMainMutationContext,
  remoteMutationRevision,
  requireMutationAdjacentCurrentMain,
} from "./remote-authorization.mjs";
import {
  assertConfirmedProject,
  assertRemoteTarget,
  projectRefFromSupabaseUrl,
} from "./remote-target.mjs";
import { localDatabaseCommands } from "./schema-local.mjs";
import { declaredSchemaSql, schemaFileNames } from "./schema-source.mjs";

const root = new URL("../../", import.meta.url);
const artifacts = new URL(".artifacts/supabase-remote/", root);
const foundationSql = readFileSync(
  new URL("packages/integration-supabase/src/schemas/000_foundation.sql", root),
  "utf8",
);
const platformPrerequisiteSql = `
select
  to_regclass('auth.users') is not null as auth_users_exists,
  to_regclass('auth.identities') is not null as auth_identities_exists,
  exists(select 1 from pg_roles where rolname='anon') as anon_exists,
  exists(select 1 from pg_roles where rolname='authenticated') as authenticated_exists,
  exists(select 1 from pg_roles where rolname='postgres') as postgres_exists;
`;
const migrationTableExistsSql =
  "select to_regclass('supabase_migrations.schema_migrations') is not null as exists;";
const migrationHistoryFingerprintSql = `
select md5(
  coalesce(
    string_agg(to_jsonb(m)::text, E'\\n' order by to_jsonb(m)::text),
    '[]'
  )
) as fingerprint
from supabase_migrations.schema_migrations m;
`;
const foundationStateSql = `
select
  to_regnamespace('app_private') is not null as app_private_exists,
  exists(select 1 from pg_roles where rolname='line_app') as line_app_exists;
`;
const cutoverFoundationSql = `
select
  exists(
    select 1 from pg_roles
    where rolname='line_app'
      and not rolcanlogin
      and not rolsuper
      and not rolbypassrls
  ) as line_app_safe,
  pg_has_role('postgres','line_app','member') as postgres_line_app_member,
  has_schema_privilege('line_app','app_private','USAGE') as line_app_private_usage,
  has_schema_privilege('line_app','app_private','CREATE') as line_app_private_create;
`;
const acceptanceSql = `
select
  exists(
    select 1 from pg_roles
    where rolname='line_app'
      and not rolcanlogin
      and not rolsuper
      and not rolbypassrls
  ) as line_app_safe,
  pg_has_role('postgres','line_app','member') as postgres_line_app_member,
  has_schema_privilege('line_app','app_private','USAGE') as line_app_private_usage,
  has_schema_privilege('line_app','app_private','CREATE') as line_app_private_create,
  has_schema_privilege('line_app','auth','USAGE') as line_app_auth_usage,
  has_column_privilege('line_app','auth.users','id','SELECT') as line_app_auth_user_select,
  has_column_privilege('line_app','auth.identities','provider_id','SELECT') as line_app_auth_identity_select,
  has_schema_privilege('anon','app_private','USAGE') as anon_private_usage,
  has_schema_privilege('authenticated','app_private','USAGE') as authenticated_private_usage,
  not exists(
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='app_private'
      and c.relkind in ('r','p')
      and not c.relrowsecurity
  ) as all_private_tables_rls,
  exists(
    select 1 from pg_constraint
    where conname='users_auth_user_id_fkey'
      and conrelid='app_private.users'::regclass
      and confrelid='auth.users'::regclass
  ) as user_auth_fk_exists;
`;
const attendanceBoundarySql = `
select p.prosecdef, r.rolname as owner,
  has_function_privilege('line_app', p.oid, 'EXECUTE') as line_app_execute
from pg_proc p
join pg_roles r on r.oid=p.proowner
where p.oid=to_regprocedure('app_private.attendance_account_active(uuid,bigint)');
`;
const missingIdentityRelationsSql = `
select relation_name
from unnest(array[
  'accounts',
  'account_logins',
  'users',
  'user_identities',
  'google_link_requests',
  'enterprises',
  'organizations',
  'enterprise_role_assignments',
  'organization_role_assignments',
  'team_role_assignments'
]) as expected(relation_name)
where to_regclass(format('app_private.%I', relation_name)) is null;
`;
const apiReadbackTimeoutMs = 10_000;
const managementApiBaseUrl = "https://api.supabase.com/v1";
const reconciliationLockName = "line_bot_v1:supabase-schema-reconciliation";
const identifierAuthorityParitySql =
  "select app_private.assert_scoped_identifier_parity() as verified;";

export function assertSupabaseRestReadback({ usersStatus, authStatus, googleEnabled }) {
  if (![401, 403, 404].includes(usersStatus)) {
    throw new Error("Remote acceptance: public Data API can read app_private users.");
  }
  if (authStatus !== 200) {
    throw new Error("Remote acceptance: Supabase Auth settings endpoint is unavailable.");
  }
  return { publicDataApiDenied: true, googleEnabled: googleEnabled === true };
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let index = 0;

  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      index = end < 0 ? sql.length : end + 1;
      current += " ";
      continue;
    }

    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) {
        current += sql.slice(index);
        break;
      }
      index = end + 2;
      current += " ";
      continue;
    }

    const char = sql[index];
    if (char === "'") {
      current += "''";
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '"') {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          index += 2;
          continue;
        }
        if (sql[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      current += sql.slice(start, index);
      continue;
    }

    if (char === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end < 0) {
          current += sql.slice(index);
          break;
        }
        current += `${tag}<body>${tag}`;
        index = end + tag.length;
        continue;
      }
    }

    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

function classifyPlanStatement(statement) {
  const normalized = statement.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();

  if (
    /^create\s+(?:or\s+replace\s+)?(?:table|type|view|materialized\s+view|function|procedure|sequence|(?:unique\s+)?index|(?:constraint\s+)?trigger|policy)\b/.test(
      lower,
    ) ||
    /^comment\s+on\b/.test(lower)
  ) {
    return { mode: "routine" };
  }

  if (/^alter\s+type\b/.test(lower)) {
    if (/\badd\s+value\b/.test(lower) && !/\brename\b/.test(lower)) {
      return { mode: "routine" };
    }
    return { mode: "sensitive", reason: "type-transition" };
  }

  if (/^alter\s+sequence\b/.test(lower)) {
    if (/\bowned\s+by\b/.test(lower)) return { mode: "routine" };
    return { mode: "sensitive", reason: "sequence-transition" };
  }

  if (/^alter\s+table\b/.test(lower)) {
    if (
      /\b(drop|rename)\b/.test(lower) ||
      /\bdisable\s+row\s+level\s+security\b/.test(lower) ||
      /\bno\s+force\s+row\s+level\s+security\b/.test(lower) ||
      /\balter\s+column\b[\s\S]*?\b(type|set\s+not\s+null|drop\s+not\s+null|drop\s+default)\b/.test(
        lower,
      ) ||
      /\badd\s+column\b[\s\S]*?\bnot\s+null\b/.test(lower)
    ) {
      return { mode: "sensitive", reason: "table-transition" };
    }

    if (
      /\badd\s+column\b/.test(lower) ||
      /\badd\s+(?:constraint\s+)?/.test(lower) ||
      /\benable\s+row\s+level\s+security\b/.test(lower) ||
      /\bforce\s+row\s+level\s+security\b/.test(lower) ||
      /\balter\s+column\b[\s\S]*?\bset\s+default\b/.test(lower)
    ) {
      return { mode: "routine" };
    }

    return { mode: "sensitive", reason: "unclassified-alter-table" };
  }

  if (/^grant\b/.test(lower)) {
    if (/\bto\s+"?(?:line_app|postgres)"?(?=\s|,|$)/.test(lower)) {
      return { mode: "routine" };
    }
    return { mode: "sensitive", reason: "privilege-expansion" };
  }

  if (/^revoke\b/.test(lower)) {
    const recipients = lower.split(/\bfrom\b/, 2)[1] ?? "";
    if (
      recipients &&
      !/(?:^|[\s,])"?line_app"?(?=\s|,|$)/.test(recipients) &&
      !/(?:^|[\s,])"?postgres"?(?=\s|,|$)/.test(recipients)
    ) {
      return { mode: "routine" };
    }
    return { mode: "sensitive", reason: "runtime-privilege-reduction" };
  }

  if (
    /^(?:drop|truncate|alter\s+policy|alter\s+default\s+privileges|create\s+extension|alter\s+extension|drop\s+extension)\b/.test(
      lower,
    )
  ) {
    return { mode: "sensitive", reason: "destructive-or-security-sensitive" };
  }

  return { mode: "sensitive", reason: "unclassified-statement" };
}

export function classifyPlan(sql) {
  const statements = splitSqlStatements(sql);
  if (!statements.length) return { mode: "noop", empty: true, reasons: [] };

  const reasons = [];
  for (const statement of statements) {
    const classification = classifyPlanStatement(statement);
    if (classification.mode === "sensitive") {
      reasons.push(classification.reason);
    }
  }

  return {
    mode: reasons.length ? "sensitive" : "routine",
    empty: false,
    reasons: [...new Set(reasons)].sort(),
  };
}

export function assertTransactionalPlan(sql) {
  // Explicit CLI diff output is review SQL, not an execution-aware migration.
  // This operator supports a single atomic transaction; never let a plan end it.
  for (const statement of splitSqlStatements(sql)) {
    const normalized = statement.replace(/\s+/g, " ").trim();
    if (
      /^(?:begin|start\s+transaction|commit|end|rollback|abort|prepare\s+transaction)\b/i.test(
        normalized,
      ) ||
      /^(?:create\s+(?:unique\s+)?index|drop\s+index|reindex)\b.*\bconcurrently\b/i.test(
        normalized,
      ) ||
      /^(?:vacuum|create\s+database|drop\s+database|alter\s+system)\b/i.test(normalized)
    ) {
      throw new Error(
        "Schema diff requires execution outside the atomic reconciliation transaction.",
      );
    }
  }
}

export function planFingerprint(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

export function assertMigrationHistoryUnchanged(before, after) {
  if (before.trim() !== after.trim()) {
    throw new Error("Remote sync changed Supabase migration history; refusing acceptance.");
  }
}

export function classifyRemoteFoundationState({ appPrivateExists, lineAppExists }) {
  if (!appPrivateExists) return "fresh";
  if (lineAppExists) return "existing";
  return "repairable";
}

function run(args, { capture = false, secrets = [] } = {}) {
  return runSupabaseCli(args, {
    capture,
    cwd: fileURLToPath(root),
    env: process.env,
    secrets,
  });
}

let remoteConfig;
let activeRemoteClient;

function requireRemoteConfig() {
  if (remoteConfig) return remoteConfig;
  const supabaseUrl = process.env.SUPABASE_URL;
  const postgresUrl = process.env.POSTGRES_URL_NON_POOLING;
  if (!supabaseUrl || !postgresUrl) {
    throw new Error(
      "SUPABASE_URL and POSTGRES_URL_NON_POOLING are required for remote schema reconciliation.",
    );
  }
  const projectRef = assertRemoteTarget(supabaseUrl, postgresUrl);
  assertConfirmedProject(projectRef, process.env.SUPABASE_CONFIRM_PROJECT);
  remoteConfig = { postgresUrl, projectRef };
  return remoteConfig;
}

function queryResultRows(result) {
  if (Array.isArray(result)) return result.at(-1)?.rows ?? [];
  return result.rows;
}

async function withRemoteClient(work) {
  if (activeRemoteClient) return work(activeRemoteClient);
  const { postgresUrl } = requireRemoteConfig();
  return withPostgres(postgresUrl, { remote: true }, work);
}

export async function runWithRemoteReconciliationLock(client, work) {
  const [lock] = (
    await client.query("select pg_try_advisory_lock(hashtextextended($1, 0)) as locked", [
      reconciliationLockName,
    ])
  ).rows;
  if (!lock?.locked) {
    throw new Error("Another production Supabase reconciliation already owns the database lock.");
  }

  activeRemoteClient = client;
  let workError;
  try {
    return await work();
  } catch (error) {
    workError = error;
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    activeRemoteClient = undefined;
    try {
      await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [
        reconciliationLockName,
      ]);
    } catch (unlockError) {
      if (!workError) throw unlockError;
    }
  }
}

async function withRemoteReconciliationLock(work) {
  if (activeRemoteClient) {
    throw new Error("Remote reconciliation lock is already active in this process.");
  }
  return withRemoteClient((client) => runWithRemoteReconciliationLock(client, work));
}

async function queryRemote(sql) {
  if (activeRemoteClient) return queryResultRows(await activeRemoteClient.query(sql));
  const { postgresUrl } = requireRemoteConfig();
  return queryRows(postgresUrl, sql, { remote: true });
}

async function assertPlatformPrerequisites() {
  const [state] = await queryRemote(platformPrerequisiteSql);
  if (
    !state?.auth_users_exists ||
    !state?.auth_identities_exists ||
    !state?.anon_exists ||
    !state?.authenticated_exists ||
    !state?.postgres_exists
  ) {
    throw new Error(
      "Remote Supabase platform prerequisites are incomplete; auth.users, auth.identities, anon, authenticated and postgres must already be provider-owned.",
    );
  }
}

async function migrationHistory() {
  const [presence] = await queryRemote(migrationTableExistsSql);
  if (!presence?.exists) return "ABSENT";
  const [history] = await queryRemote(migrationHistoryFingerprintSql);
  if (typeof history?.fingerprint !== "string") {
    throw new Error("Could not fingerprint remote Supabase migration history.");
  }
  return `PRESENT:${history.fingerprint}`;
}

async function remoteFoundationState() {
  const [state] = await queryRemote(foundationStateSql);
  if (
    !state ||
    typeof state.app_private_exists !== "boolean" ||
    typeof state.line_app_exists !== "boolean"
  ) {
    throw new Error("Could not read remote application foundation state.");
  }
  return {
    appPrivateExists: state.app_private_exists,
    lineAppExists: state.line_app_exists,
  };
}

async function assertCutoverFoundationReady() {
  const [state] = await queryRemote(cutoverFoundationSql);
  if (
    !state?.line_app_safe ||
    !state.postgres_line_app_member ||
    !state.line_app_private_usage ||
    state.line_app_private_create
  ) {
    throw new Error("Remote foundation privileges are not safe for scoped identifier cutover.");
  }
}

function localDatabaseUrl() {
  const status = JSON.parse(run(["status", "--output", "json"], { capture: true }));
  if (typeof status.DB_URL !== "string") throw new Error("Supabase local DB_URL is unavailable.");
  return status.DB_URL;
}

async function rebuildDesiredLocal() {
  run(localDatabaseCommands.start);
  run(localDatabaseCommands.reset);
  const desired = `BEGIN;\nDROP SCHEMA IF EXISTS app_private CASCADE;\n${declaredSchemaSql()}\nCOMMIT;\n`;
  writeFileSync(new URL("desired.sql", artifacts), desired);
  await executeSql(localDatabaseUrl(), desired, { remote: false });
}

function generatePlan(artifactName = "plan.sql") {
  mkdirSync(artifacts, { recursive: true });
  const { postgresUrl } = requireRemoteConfig();
  const plan = fileURLToPath(new URL(artifactName, artifacts));
  writeFileSync(plan, "");
  run(
    [
      "db",
      "diff",
      "--from",
      postgresUrl,
      "--to",
      "local",
      "--schema",
      "app_private",
      "--strict-coverage",
      "--output",
      plan,
    ],
    { secrets: [postgresUrl] },
  );
  const sql = readFileSync(plan, "utf8");
  const fingerprint = planFingerprint(sql);
  if (artifactName === "plan.sql") {
    writeFileSync(new URL("plan.sha256", artifacts), `${fingerprint}\n`);
  }
  return { path: plan, sql, fingerprint };
}

export async function applyAuthorizedRemoteSql({ sql, query, authorize }) {
  await authorize();
  return query(sql);
}

async function applyRemoteSql(sql, artifactName) {
  const { postgresUrl } = requireRemoteConfig();
  writeFileSync(new URL(artifactName, artifacts), sql);
  if (activeRemoteClient) {
    await applyAuthorizedRemoteSql({
      sql,
      query: (statement) => activeRemoteClient.query(statement),
      authorize: () => requireMutationAdjacentCurrentMain(),
    });
    return;
  }
  await applyAuthorizedRemoteSql({
    sql,
    query: (statement) => executeSql(postgresUrl, statement, { remote: true }),
    authorize: () => requireMutationAdjacentCurrentMain(),
  });
}

async function identifierAuthorityState(query = queryRemote, options) {
  const [catalog] = await query(identifierAuthorityCatalogSql);
  const state = classifyIdentifierAuthorityState(catalog ?? {}, options);
  if (state === "cutover-required") return { state };
  const [row] = await query(identifierAuthorityMarkerSql);
  return { state: "active", catalog, marker: assertIdentifierAuthorityMarker(row) };
}

export function assertIdentifierLifecycleOperatorOnly(catalog) {
  if (
    catalog?.line_app_cutover_execute ||
    catalog?.anon_cutover_execute ||
    catalog?.authenticated_cutover_execute ||
    !catalog?.cutover_operator_owned ||
    catalog?.line_app_runtime_activation_execute ||
    catalog?.anon_runtime_activation_execute ||
    catalog?.authenticated_runtime_activation_execute ||
    !catalog?.runtime_activation_operator_owned
  ) {
    throw new Error("Remote acceptance: identifier lifecycle operations are not operator-only.");
  }
}

export function identifierRuntimeActivationAction(marker, revision) {
  const releaseRevision = assertIdentifierCutoverRevision(revision);
  if (marker.runtimeReady) {
    return { kind: "noop", runtimeRevision: marker.runtimeRevision };
  }
  return { kind: "activate", runtimeRevision: releaseRevision };
}

async function assertDesiredIdentifierAuthority() {
  const [catalog] = await queryRows(localDatabaseUrl(), identifierAuthorityCatalogSql, {
    remote: false,
  });
  if (classifyIdentifierAuthorityState(catalog ?? {}) !== "marker-readback-required") {
    throw new Error("Desired schema is missing the complete scoped identifier authority.");
  }
}

async function verifyIdentifierAuthorityReadback() {
  const authority = await identifierAuthorityState();
  if (authority.state !== "active") {
    throw new Error("Remote acceptance: scoped identifier authority is not activated.");
  }
  const [catalog] = await queryRemote(identifierAuthorityCatalogSql);
  assertIdentifierLifecycleOperatorOnly(catalog);
  await queryRemote(identifierAuthorityParitySql);
  const [countRow] = await queryRemote(identifierAuthorityCountsSql);
  const counts = assertIdentifierAuthorityCounts(countRow);
  const evidence = { ...authority.marker, parityVerified: true, counts };
  writeFileSync(
    new URL("scoped-identifier-readback.json", artifacts),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  return evidence;
}

async function verifyRuntimeAuthBoundary() {
  await withRemoteClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE line_app");
      const result = await client.query(
        "select app_private.attendance_account_active('00000000-0000-0000-0000-000000000000'::uuid, 0) as active",
      );
      if (result.rows[0]?.active !== false) {
        throw new Error(
          "Remote acceptance: attendance Auth boundary returned an unexpected result.",
        );
      }

      await client.query("SAVEPOINT auth_direct_access");
      try {
        await client.query("select id from auth.users limit 1");
        throw new Error("Remote acceptance: line_app can directly read auth.users.");
      } catch (error) {
        if (error.message === "Remote acceptance: line_app can directly read auth.users.")
          throw error;
        if (error.code !== "42501") throw error;
        await client.query("ROLLBACK TO SAVEPOINT auth_direct_access");
      }
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

export function supabaseManagementRecoveryConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required for recovery readback.");
  if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required for recovery readback.");
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl);
  assertConfirmedProject(projectRef, env.SUPABASE_CONFIRM_PROJECT);
  return { projectRef, accessToken };
}

export function assertSupabaseRecoveryReadback(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof payload.pitr_enabled !== "boolean" ||
    typeof payload.walg_enabled !== "boolean" ||
    !Array.isArray(payload.backups)
  ) {
    throw new Error("Supabase recovery readback returned an unexpected response.");
  }

  const completed = payload.backups
    .filter(
      (backup) =>
        backup &&
        typeof backup === "object" &&
        backup.status === "COMPLETED" &&
        typeof backup.inserted_at === "string" &&
        Number.isFinite(Date.parse(backup.inserted_at)),
    )
    .map((backup) => ({
      insertedAt: backup.inserted_at,
      physical: backup.is_physical_backup === true,
    }))
    .sort((a, b) => Date.parse(b.insertedAt) - Date.parse(a.insertedAt));

  const pitrReady = payload.pitr_enabled === true && payload.walg_enabled === true;
  if (!pitrReady && completed.length === 0) {
    throw new Error(
      "Supabase provider recovery is unavailable: no PITR/WALG capability and no completed managed backup. Refusing data cutover.",
    );
  }

  return {
    provider: "supabase",
    pitrEnabled: payload.pitr_enabled,
    walgEnabled: payload.walg_enabled,
    completedBackupCount: completed.length,
    latestCompletedBackupAt: completed[0]?.insertedAt ?? null,
    latestCompletedBackupPhysical: completed[0]?.physical ?? null,
  };
}

export async function verifySupabaseRecoveryReadback(
  config = supabaseManagementRecoveryConfig(),
  fetchImpl = globalThis.fetch,
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Supabase recovery readback requires a fetch implementation.");
  }
  const response = await fetchImpl(
    `${managementApiBaseUrl}/projects/${config.projectRef}/database/backups`,
    {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(apiReadbackTimeoutMs),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase recovery readback failed with HTTP ${response.status}; refusing data cutover.`,
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Supabase recovery readback did not return JSON.");
  }
  return { projectRef: config.projectRef, ...assertSupabaseRecoveryReadback(payload) };
}

export function requiresIdentifierCutoverRecovery({ command, foundationState, authorityState }) {
  return command === "sync" && foundationState !== "fresh" && authorityState === "cutover-required";
}

export async function verifyIdentifierCutoverRecovery({
  projectRef,
  schemaSql,
  authorization,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  const schemaSha256 = planFingerprint(schemaSql.replaceAll("\r\n", "\n"));
  if (
    authorization?.decision === "proceed-without-backup" &&
    authorization.authority === "scoped-identifiers-v1" &&
    authorization.projectRef === projectRef &&
    authorization.schemaSha256 === schemaSha256 &&
    typeof authorization.id === "string" &&
    authorization.id.length > 0 &&
    typeof authorization.instruction === "string" &&
    authorization.instruction.length > 0
  ) {
    assertValidatedMainMutationContext(env);
    assertConfirmedProject(projectRef, env.SUPABASE_CONFIRM_PROJECT);
    const revision = remoteMutationRevision(env);
    if (env.GITHUB_SHA !== revision || env.GITHUB_REF !== "refs/heads/main") {
      throw new Error("Unbacked cutover authorization requires the exact main Release revision.");
    }
    return {
      projectRef,
      provider: "supabase",
      recoveryMode: "explicit-no-backup-authorization",
      providerRecoveryVerified: false,
      backupVerified: false,
      disposition: "explicitly-authorized-without-backup",
      authorizationId: authorization.id,
      authority: authorization.authority,
      schemaSha256,
      revision,
    };
  }
  const config = supabaseManagementRecoveryConfig(env);
  assertConfirmedProject(projectRef, config.projectRef);
  return verifySupabaseRecoveryReadback(config, fetchImpl);
}

function persistSupabaseRecoveryEvidence(evidence) {
  writeFileSync(
    new URL("recovery-readback.json", artifacts),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

export function supabaseApiReadbackConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required for --api readback.");
  if (!publishableKey) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for --api readback.",
    );
  }
  projectRefFromSupabaseUrl(supabaseUrl);
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), publishableKey };
}

async function fetchApiReadback(fetchImpl, url, publishableKey) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Supabase API readback requires a fetch implementation.");
  }
  return fetchImpl(url, {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(apiReadbackTimeoutMs),
  });
}

export async function verifySupabaseApiReadback(
  config = supabaseApiReadbackConfig(),
  fetchImpl = globalThis.fetch,
) {
  const usersApi = await fetchApiReadback(
    fetchImpl,
    `${config.supabaseUrl}/rest/v1/users?select=id&limit=1`,
    config.publishableKey,
  );
  const auth = await fetchApiReadback(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/settings`,
    config.publishableKey,
  );
  let settings = {};
  if (auth.ok) {
    try {
      settings = await auth.json();
    } catch {
      throw new Error("Remote acceptance: Supabase Auth settings endpoint did not return JSON.");
    }
  }
  return assertSupabaseRestReadback({
    usersStatus: usersApi.status,
    authStatus: auth.status,
    googleEnabled: settings.external?.google === true,
  });
}

async function verifyRemoteAcceptance() {
  const [state] = await queryRemote(acceptanceSql);
  if (!state?.line_app_safe)
    throw new Error("Remote acceptance: line_app is missing or privileged.");
  if (!state.postgres_line_app_member)
    throw new Error("Remote acceptance: postgres is not a line_app member.");
  if (!state.line_app_private_usage || state.line_app_private_create)
    throw new Error("Remote acceptance: line_app app_private privileges are incorrect.");
  if (
    state.line_app_auth_usage ||
    state.line_app_auth_user_select ||
    state.line_app_auth_identity_select
  )
    throw new Error("Remote acceptance: line_app has direct Supabase Auth privileges.");
  if (state.anon_private_usage || state.authenticated_private_usage)
    throw new Error("Remote acceptance: browser roles can use app_private.");
  if (!state.all_private_tables_rls)
    throw new Error("Remote acceptance: an app_private table has RLS disabled.");
  if (!state.user_auth_fk_exists)
    throw new Error("Remote acceptance: users.auth_user_id no longer references auth.users.");

  const missing = await queryRemote(missingIdentityRelationsSql);
  if (missing.length) {
    throw new Error(`Remote acceptance: identity relation ${missing[0].relation_name} is missing.`);
  }

  const [fn] = await queryRemote(attendanceBoundarySql);
  if (!fn?.prosecdef || fn.owner === "line_app" || !fn.line_app_execute) {
    throw new Error("Remote acceptance: attendance Auth SECURITY DEFINER boundary is invalid.");
  }
  await verifyRuntimeAuthBoundary();
  return verifyIdentifierAuthorityReadback();
}

export function parseArgs(argv) {
  const [command = "sync", ...flags] = argv;
  if (!["activate-identifiers", "plan", "recovery", "sync", "verify"].includes(command)) {
    throw new Error(
      "Usage: schema:remote [activate-identifiers|plan|recovery|sync|verify] [--api]",
    );
  }
  for (const flag of flags) {
    if (!["--api"].includes(flag)) {
      throw new Error(
        "Usage: schema:remote [activate-identifiers|plan|recovery|sync|verify] [--api]",
      );
    }
  }
  const api = flags.includes("--api");
  if (api && command !== "verify") {
    throw new Error("schema:remote --api is only valid with verify.");
  }
  return { command, api };
}

async function activateIdentifierRuntime(projectRef) {
  mkdirSync(artifacts, { recursive: true });
  await assertPlatformPrerequisites();
  const before = await migrationHistory();
  writeFileSync(new URL("migration-history.before.txt", artifacts), `${before}\n`);

  const authority = await identifierAuthorityState();
  if (authority.state !== "active") {
    throw new Error("Scoped identifier authority must be cut over before runtime activation.");
  }
  assertIdentifierLifecycleOperatorOnly(authority.catalog);

  const action = identifierRuntimeActivationAction(authority.marker, remoteMutationRevision());
  if (action.kind === "activate") {
    await applyRemoteSql(
      identifierRuntimeActivationTransactionSql(action.runtimeRevision),
      "activate-identifiers.sql",
    );
  }

  const evidence = await verifyIdentifierAuthorityReadback();
  if (!evidence.runtimeReady) {
    throw new Error("Scoped identifier runtime activation did not become ready.");
  }
  if (action.kind === "activate" && evidence.runtimeRevision !== action.runtimeRevision) {
    throw new Error("Scoped identifier runtime activation revision does not match this release.");
  }

  const after = await migrationHistory();
  writeFileSync(new URL("migration-history.after.txt", artifacts), `${after}\n`);
  assertMigrationHistoryUnchanged(before, after);
  console.log(
    `Scoped identifier runtime ${
      action.kind === "noop" ? "already active" : "activated"
    } for ${projectRef} at revision ${evidence.runtimeRevision}; migration history drift = 0.`,
  );
  return evidence;
}

async function runRemoteCommand({ projectRef, command, api }) {
  mkdirSync(artifacts, { recursive: true });

  await assertPlatformPrerequisites();
  const before = await migrationHistory();
  writeFileSync(new URL("migration-history.before.txt", artifacts), `${before}\n`);

  let foundationState = classifyRemoteFoundationState(await remoteFoundationState());
  const initialIdentifierAuthority = await identifierAuthorityState(queryRemote, {
    allowRegistryOnly: command === "sync",
  });
  if (
    requiresIdentifierCutoverRecovery({
      command,
      foundationState,
      authorityState: initialIdentifierAuthority.state,
    })
  ) {
    if (foundationState === "existing") await assertCutoverFoundationReady();
    const recoveryEvidence = await verifyIdentifierCutoverRecovery({
      projectRef,
      schemaSql: declaredSchemaSql(),
      authorization: JSON.parse(
        readFileSync(new URL("identifier-cutover-authorization.json", import.meta.url), "utf8"),
      ),
    });
    persistSupabaseRecoveryEvidence(recoveryEvidence);
    if (recoveryEvidence.backupVerified === false) {
      console.warn(
        `No verified backup: cutover explicitly authorized by ${recoveryEvidence.authorizationId} for ${projectRef} at ${recoveryEvidence.revision}.`,
      );
    }
  }
  await rebuildDesiredLocal();
  await assertDesiredIdentifierAuthority();
  if (foundationState === "repairable") {
    if (command === "verify") {
      throw new Error("Remote foundation drift detected: line_app is missing.");
    }
    if (initialIdentifierAuthority.state === "active" && command === "sync") {
      throw new Error(
        "Remote foundation drift exists after scoped identifier activation; refusing automatic repair.",
      );
    }
    if (command !== "plan") {
      await applyRemoteSql(`BEGIN;\n${foundationSql}\nCOMMIT;\n`, "foundation-repair.sql");
      foundationState = classifyRemoteFoundationState(await remoteFoundationState());
      if (foundationState !== "existing") {
        throw new Error("Remote foundation repair did not converge.");
      }
      await assertCutoverFoundationReady();
    }
  }
  const identifierAuthority =
    foundationState === "existing" && initialIdentifierAuthority.state === "cutover-required"
      ? await identifierAuthorityState(queryRemote, { allowRegistryOnly: command === "sync" })
      : initialIdentifierAuthority;

  if (foundationState === "fresh") {
    if (command === "plan") {
      console.log(
        `Remote target: ${projectRef}; foundation: fresh. Full application bootstrap will apply ${schemaFileNames().join(", ")} and activate scoped identifier authority in one transaction; Supabase platform state and migration history stay outside the mutation boundary.`,
      );
      return;
    }
    if (command === "verify") {
      throw new Error(
        "Remote schema drift detected: app_private and line_app are not bootstrapped.",
      );
    }
    const revision = remoteMutationRevision();
    await applyRemoteSql(
      identifierCutoverTransactionSql({
        ddl: declaredSchemaSql(),
        revision,
        freezeLegacy: false,
      }),
      "bootstrap.sql",
    );
  } else {
    const plan = generatePlan();
    const classification = classifyPlan(plan.sql);
    if (command === "plan") {
      console.log(`Remote target: ${projectRef}; foundation: ${foundationState}.`);
      if (foundationState === "repairable") {
        console.log(
          "Remote foundation repair is required and will run only during validated-main sync before schema reconciliation.",
        );
      }
      console.log(
        `Plan classification: ${classification.mode}; fingerprint: ${plan.fingerprint}; reasons: ${
          classification.reasons.join(", ") || "none"
        }.`,
      );
      console.log(
        identifierAuthority.state === "cutover-required"
          ? "Scoped identifier authority cutover is required and will run only during validated-main sync."
          : `Scoped identifier authority is active at revision ${identifierAuthority.marker.revision}.`,
      );
      if (identifierAuthority.state === "cutover-required") {
        console.log(
          "Existing-database cutover requires provider recovery readback or explicit authorization for this exact project and schema without a backup before any remote DDL.",
        );
      }
      console.log(
        plan.sql ||
          "Remote app_private schema already matches packages/integration-supabase/src/schemas.",
      );
      return;
    }
    if (command === "verify") {
      if (!classification.empty) throw new Error(`Remote schema drift detected; see ${plan.path}`);
      await verifyRemoteAcceptance();
      const apiReadback = api ? await verifySupabaseApiReadback() : undefined;
      const after = await migrationHistory();
      writeFileSync(new URL("migration-history.after.txt", artifacts), `${after}\n`);
      assertMigrationHistoryUnchanged(before, after);
      console.log(
        `Remote verify PASS for ${projectRef}: schema drift = 0; ownership/security readback = PASS${
          apiReadback
            ? `; API readback = PASS (public Data API denied, Google enabled = ${apiReadback.googleEnabled})`
            : ""
        }; migration history drift = 0.`,
      );
      return;
    }

    assertTransactionalPlan(plan.sql);
    const sql =
      identifierAuthority.state === "cutover-required"
        ? identifierCutoverTransactionSql({
            ddl: plan.sql,
            revision: remoteMutationRevision(),
            freezeLegacy: true,
          })
        : `BEGIN;\n${foundationSql}\n${classification.empty ? "" : plan.sql}\nCOMMIT;\n`;
    await applyRemoteSql(sql, "apply.sql");
  }

  const after = await migrationHistory();
  writeFileSync(new URL("migration-history.after.txt", artifacts), `${after}\n`);
  assertMigrationHistoryUnchanged(before, after);

  const verification = generatePlan("verification.sql");
  if (!classifyPlan(verification.sql).empty) {
    throw new Error(`Remote sync left schema drift; see ${verification.path}`);
  }
  const identifierReadback = await verifyRemoteAcceptance();
  console.log(
    `Remote sync PASS for ${projectRef}: schema drift = 0; ownership/security readback = PASS; scoped identifier authority revision = ${identifierReadback.revision}; migration history drift = 0.`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  loadRootEnv();
  const { command, api } = parseArgs(argv);
  if (command === "sync" || command === "activate-identifiers")
    assertValidatedMainMutationContext();

  if (command === "recovery") {
    mkdirSync(artifacts, { recursive: true });
    const evidence = await verifySupabaseRecoveryReadback();
    persistSupabaseRecoveryEvidence(evidence);
    console.log(
      `Supabase recovery PASS for ${evidence.projectRef}: PITR = ${evidence.pitrEnabled}; WALG = ${evidence.walgEnabled}; completed managed backups = ${evidence.completedBackupCount}.`,
    );
    return;
  }

  const { projectRef } = requireRemoteConfig();
  if (command === "activate-identifiers") {
    return withRemoteReconciliationLock(() => activateIdentifierRuntime(projectRef));
  }
  const execute = () => runRemoteCommand({ projectRef, command, api });

  if (command === "sync") {
    return withRemoteReconciliationLock(execute);
  }
  return execute();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
