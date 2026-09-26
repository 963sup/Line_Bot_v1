import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadRootEnv } from "../runtime/load-env.mjs";
import { executeSql, queryRows, withPostgres } from "./postgres.mjs";
import { localDatabaseCommands } from "./schema-local.mjs";
import { declaredSchemaSql, schemaFileNames } from "./schema-source.mjs";

const root = new URL("../../", import.meta.url);
const artifacts = new URL(".artifacts/supabase-remote/", root);
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
const foundationSql = readFileSync(new URL("supabase/schemas/000_foundation.sql", root), "utf8");
const accountLoginSchemaSql = readFileSync(
  new URL("supabase/schemas/101_account_logins.sql", root),
  "utf8",
);
const dailyCheckInClaimSchemaSql = readFileSync(
  new URL("supabase/schemas/805_daily_check_in_claims.sql", root),
  "utf8",
);
const crossOwnerConstraintSchemaSql = readFileSync(
  new URL("supabase/schemas/910_cross_owner_constraints.sql", root),
  "utf8",
);
const permissionDefinitionSchemaSql = readFileSync(
  new URL("supabase/schemas/510_permission_definitions.sql", root),
  "utf8",
);
const permissionAdministrationSchemaSql = readFileSync(
  new URL("supabase/schemas/512_permission_administration.sql", root),
  "utf8",
);
const repositoryTeamAccessSchemaSql = readFileSync(
  new URL("supabase/schemas/602_repository_team_access.sql", root),
  "utf8",
);
const repositoryStarsSchemaSql = readFileSync(
  new URL("supabase/schemas/603_repository_stars.sql", root),
  "utf8",
);
const repositoryLabelSchemaSql = readFileSync(
  new URL("supabase/schemas/610_repository_labels.sql", root),
  "utf8",
);
const repositoryMilestoneSchemaSql = readFileSync(
  new URL("supabase/schemas/611_repository_milestones.sql", root),
  "utf8",
);
const repositoryCommandSchemaSql = readFileSync(
  new URL("supabase/schemas/604_repository_commands.sql", root),
  "utf8",
);
const crossOwnerProjectionSchemaSql = readFileSync(
  new URL("supabase/schemas/900_cross_owner_projections.sql", root),
  "utf8",
);
const transactionCoordinatorSchemaSql = readFileSync(
  new URL("supabase/schemas/920_transaction_coordinators.sql", root),
  "utf8",
);
const accessEnforcementSchemaSql = readFileSync(
  new URL("supabase/schemas/930_access_enforcement.sql", root),
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
const accountLoginCompatibilityStateSql = `
select
  to_regclass('app_private.account_logins') is not null as table_exists,
  to_regprocedure('app_private.set_account_login(text,text,text,bigint)') is not null as function_exists;
`;
const accountLoginCompatibilityAcceptanceSql = `
select
  c.relrowsecurity as rls_enabled,
  has_table_privilege('line_app','app_private.account_logins','SELECT') as line_app_select,
  has_table_privilege('line_app','app_private.account_logins','INSERT') as line_app_insert,
  has_table_privilege('line_app','app_private.account_logins','UPDATE') as line_app_update,
  has_table_privilege('anon','app_private.account_logins','SELECT') as anon_select,
  has_table_privilege('authenticated','app_private.account_logins','SELECT') as authenticated_select,
  has_function_privilege(
    'line_app',
    'app_private.set_account_login(text,text,text,bigint)',
    'EXECUTE'
  ) as line_app_execute
from pg_class c
where c.oid='app_private.account_logins'::regclass;
`;
const dailyCheckInCompatibilityStateSql = `
select
  to_regclass('app_private.daily_check_in_claims') is not null as table_exists,
  to_regprocedure('app_private.enforce_daily_check_in_claim_ledger_parity()') is not null as function_exists,
  exists(
    select 1 from pg_trigger
    where tgname='daily_check_in_claim_requires_ledger'
      and not tgisinternal
  ) as trigger_exists;
`;
const dailyCheckInCompatibilityAcceptanceSql = `
select
  c.relrowsecurity as rls_enabled,
  has_table_privilege('line_app','app_private.daily_check_in_claims','SELECT') as line_app_select,
  has_table_privilege('line_app','app_private.daily_check_in_claims','INSERT') as line_app_insert,
  has_table_privilege('anon','app_private.daily_check_in_claims','SELECT') as anon_select,
  has_table_privilege('authenticated','app_private.daily_check_in_claims','SELECT') as authenticated_select,
  has_function_privilege(
    'line_app',
    'app_private.enforce_daily_check_in_claim_ledger_parity()',
    'EXECUTE'
  ) as line_app_execute,
  exists(
    select 1 from pg_trigger
    where tgname='daily_check_in_claim_requires_ledger'
      and tgrelid='app_private.daily_check_in_claims'::regclass
      and not tgisinternal
      and tgenabled <> 'D'
  ) as parity_trigger_enabled,
  exists(
    select 1 from pg_constraint
    where conname='daily_check_in_claims_user_id_fkey'
      and conrelid='app_private.daily_check_in_claims'::regclass
      and confrelid='app_private.users'::regclass
  ) as user_fk_exists
from pg_class c
where c.oid='app_private.daily_check_in_claims'::regclass;
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
const reconciliationLockName = "line-bot-v1:supabase-schema-reconciliation";

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

export function planFingerprint(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

export function assertReviewedPlan(sql, reviewedFingerprint) {
  const actual = planFingerprint(sql);
  if (!/^[0-9a-f]{64}$/.test(reviewedFingerprint ?? "")) {
    throw new Error(
      "SUPABASE_REVIEWED_PLAN_SHA256 must be an exact lowercase SHA-256 fingerprint.",
    );
  }
  if (actual !== reviewedFingerprint) {
    throw new Error(
      `Reviewed Supabase plan no longer matches current remote state (expected ${reviewedFingerprint}, actual ${actual}).`,
    );
  }
  return actual;
}

export function authorizeSyncPlan(sql, reviewedFingerprint) {
  const classification = classifyPlan(sql);
  if (reviewedFingerprint !== undefined) {
    assertReviewedPlan(sql, reviewedFingerprint);
  }
  return classification;
}

export function assertMigrationHistoryUnchanged(before, after) {
  if (before.trim() !== after.trim()) {
    throw new Error("Remote sync changed Supabase migration history; refusing acceptance.");
  }
}

export function projectRefFromSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL must be a valid https://<project-ref>.supabase.co URL.");
  }
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (url.protocol !== "https:" || !match || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("SUPABASE_URL must be a valid https://<project-ref>.supabase.co URL.");
  }
  return match[1];
}

export function assertRemoteTarget(supabaseUrl, postgresUrl) {
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl);
  let databaseUrl;
  try {
    databaseUrl = new URL(postgresUrl);
  } catch {
    throw new Error("POSTGRES_URL_NON_POOLING must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("POSTGRES_URL_NON_POOLING must use postgres:// or postgresql://.");
  }
  if (decodeURIComponent(databaseUrl.pathname) !== "/postgres") {
    throw new Error("POSTGRES_URL_NON_POOLING must target the postgres database.");
  }
  if (databaseUrl.port === "6543") {
    throw new Error("POSTGRES_URL_NON_POOLING must not use the transaction pooler on port 6543.");
  }
  const hostnameMatches = databaseUrl.hostname.includes(projectRef);
  const usernameMatches = decodeURIComponent(databaseUrl.username).endsWith(`.${projectRef}`);
  if (!hostnameMatches && !usernameMatches) {
    throw new Error(
      `POSTGRES_URL_NON_POOLING does not target SUPABASE_URL project ${projectRef}; refusing remote mutation.`,
    );
  }
  return projectRef;
}

export function assertConfirmedProject(projectRef, confirmedProject) {
  if (!confirmedProject || confirmedProject !== projectRef) {
    throw new Error(
      `SUPABASE_CONFIRM_PROJECT must exactly match target project ${projectRef}; refusing remote access.`,
    );
  }
}

export function classifyRemoteFoundationState({ appPrivateExists, lineAppExists }) {
  if (!appPrivateExists) return "fresh";
  if (lineAppExists) return "existing";
  return "repairable";
}

export function accountLoginExpansionSql(source = accountLoginSchemaSql) {
  return source.trim();
}

export function classifyAccountLoginCompatibility({ tableExists, functionExists }) {
  if (tableExists && functionExists) return "ready";
  if (!tableExists && !functionExists) return "missing";
  return "partial";
}

export function classifyDailyCheckInCompatibility({ tableExists, functionExists, triggerExists }) {
  if (tableExists && functionExists && triggerExists) return "ready";
  if (!tableExists && !functionExists && !triggerExists) return "missing";
  return "partial";
}

export function parseLegacyEnterpriseMetadata(name = "", slug = "") {
  if (!name && !slug) return null;
  if (!name || !slug) {
    throw new Error("Legacy Enterprise cutover requires both name and slug.");
  }
  if (
    name !== name.trim() ||
    name.length < 1 ||
    name.length > 120 ||
    slug !== slug.trim() ||
    slug !== slug.toLowerCase() ||
    slug.length < 1 ||
    slug.length > 39 ||
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)
  ) {
    throw new Error("Legacy Enterprise cutover contains an invalid name or slug.");
  }
  return { name, slug };
}

export function resolveLegacyEnterpriseMetadata(state, input) {
  const unresolved = state.enterpriseMetadataRows;

  if (!input) {
    if (unresolved.length) {
      throw new Error(
        `Remote preserve-data preparation requires explicit Enterprise name and slug for ${unresolved.length} unresolved legacy Enterprise row(s); use manual reconciliation.`,
      );
    }
    return [];
  }

  if (unresolved.length > 1) {
    throw new Error(
      `Single-Enterprise cutover input cannot resolve ${unresolved.length} legacy Enterprise rows; an explicit multi-row owner migration is required.`,
    );
  }

  if (unresolved.length === 1) {
    const [row] = unresolved;
    if (
      (row.name != null && row.name !== input.name) ||
      (row.slug != null && row.slug !== input.slug)
    ) {
      throw new Error(
        "Legacy Enterprise cutover conflicts with an already persisted current value.",
      );
    }
    return [{ accountId: row.accountId, ...input }];
  }

  const exact = state.enterpriseRows.filter(
    (row) => row.name === input.name && row.slug === input.slug,
  );
  if (exact.length !== 1) {
    throw new Error(
      "Legacy Enterprise cutover input does not match exactly one already-current Enterprise.",
    );
  }
  return [];
}

export function dailyCheckInCompatibilitySql(
  claimSource = dailyCheckInClaimSchemaSql,
  constraintSource = crossOwnerConstraintSchemaSql,
) {
  const marker =
    "-- DailyCheckIn owns reward outcome; Ledger owns value fact. They must commit together.";
  const start = constraintSource.indexOf(marker);
  if (start < 0)
    throw new Error("Could not locate canonical DailyCheckIn parity constraint block.");
  return `${claimSource.trim()}\n\n${constraintSource.slice(start).trim()}`;
}

function extractFunctionDefinition(source, name) {
  const start = source.indexOf(`create function app_private.${name}(`);
  if (start < 0) throw new Error(`Could not locate canonical ${name} function definition.`);
  const terminator = "\n$function$;";
  const end = source.indexOf(terminator, start);
  if (end < 0) throw new Error(`Could not locate canonical ${name} function terminator.`);
  return source
    .slice(start, end + terminator.length)
    .replace(/^create function /, "create or replace function ");
}

export function governanceCompatibilityFunctionSql(source = transactionCoordinatorSchemaSql) {
  return [
    "provision_enterprise_scope",
    "provision_organization_scope",
    "bootstrap_enterprise",
    "bootstrap_organization",
  ]
    .map((name) => extractFunctionDefinition(source, name))
    .join("\n\n");
}

export function governanceCompatibilityAccessSql(source = accessEnforcementSchemaSql) {
  const signatures = [
    "bootstrap_enterprise(text,text,text,text,text,text,text,uuid,bigint)",
    "bootstrap_organization(text,text,text,text,text,text,text,uuid,bigint)",
    "provision_enterprise_scope(text,text,text,text,bigint)",
    "provision_organization_scope(text,text,text,text,bigint)",
  ];
  return source
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => signatures.some((signature) => statement.includes(signature)))
    .map((statement) => `${statement};`)
    .join("\n");
}

export function permissionSubjectVersionExpansionSql(source = permissionAdministrationSchemaSql) {
  const start = source.indexOf("create table app_private.permission_subject_versions (");
  const endMarker =
    "create policy backend on app_private.permission_subject_versions\n  for all to line_app using (true) with check (true);";
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate canonical permission_subject_versions expansion.");
  }
  return source.slice(start, end + endMarker.length);
}

export function repositoryEffectiveAccessExpansionSql(
  source = crossOwnerProjectionSchemaSql,
) {
  const start = source.indexOf("create view app_private.repository_effective_access");
  const endMarker = "group by repository_id, user_id;";
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate canonical repository_effective_access projection.");
  }
  return source.slice(start, end + endMarker.length);
}

export function repositoryProvisionCompatibilitySql(source = transactionCoordinatorSchemaSql) {
  return extractFunctionDefinition(source, "provision_repository");
}

export function repositoryProvisionCompatibilityAccessSql(source = accessEnforcementSchemaSql) {
  const signature = "provision_repository(text,text,text,text,text)";
  return source
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.includes(signature))
    .map((statement) => `${statement};`)
    .join("\n");
}

export function classifyRepositoryRuntimeCompatibility(state) {
  const structuralCurrent =
    state.ownerAccountIdColumn &&
    state.ownerAccountKindColumn &&
    state.nextIssueNumberColumn &&
    !state.legacyOrganizationIdColumn;
  const supportCurrent =
    state.repositoryAccessTable &&
    state.repositoryTeamAccessTable &&
    state.repositoryStarsTable &&
    state.repositoryCommandsTable &&
    state.repositoryLabelsTable &&
    state.repositoryMilestonesTable &&
    state.issueNumberColumn &&
    state.issueMilestoneColumn &&
    state.repositoryEffectiveAccessView &&
    state.provisionRepositoryFunction;

  if (structuralCurrent && supportCurrent) return "ready";
  if (
    structuralCurrent &&
    state.repositoryAccessTable &&
    (state.issueRows === 0 || (state.issueNumberColumn && state.issueMilestoneColumn))
  ) {
    return "repairable";
  }
  if (
    state.repositoryRows === 0 &&
    state.issueRows === 0 &&
    state.discussionRows === 0 &&
    state.discussionCommentRows === 0 &&
    state.repositoryAccessTable &&
    state.legacyOrganizationIdColumn &&
    !state.ownerAccountIdColumn &&
    !state.ownerAccountKindColumn
  ) {
    return "repairable";
  }
  return "partial";
}

export function permissionNamesFromSource(source = permissionDefinitionSchemaSql) {
  const match = source.match(
    /create\s+type\s+app_private\.permission_name\s+as\s+enum\s*\(([^;]+)\)\s*;/i,
  );
  if (!match) throw new Error("Could not parse canonical permission_name enum.");
  const names = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error("Canonical permission_name enum is empty or duplicated.");
  }
  return names;
}

export function assertGeneralManagementExpansionState(state) {
  const unsupported = [
    ["BotAccount roots", state.botAccountRoots],
    ["BotAccount rows", state.botAccounts],
    ["BotAccount receipts", state.botReceipts],
    ["Project issue references", state.projectIssueReferences],
    ["Repository rows requiring owner migration", state.repositoriesNeedingOwnerMigration],
    ["Issue rows requiring number migration", state.issuesNeedingNumber],
    ["Organization rows requiring name migration", state.organizationsNeedingName],
    ["Team rows requiring slug migration", state.teamsNeedingSlug],
    ["Enterprise Team rows requiring slug migration", state.enterpriseTeamsNeedingSlug],
    ["unsupported permission literals", state.invalidPermissions],
  ];
  const blocked = unsupported.find(([, count]) => Number(count) > 0);
  if (blocked) {
    throw new Error(
      `Remote preserve-data preparation needs an explicit owner migration for ${blocked[0]} (${blocked[1]} row(s)); refusing to guess or delete data.`,
    );
  }
}

function redact(value, secrets) {
  let result = value;
  for (const secret of secrets) if (secret) result = result.replaceAll(secret, "<redacted>");
  return result;
}

function run(args, { capture = false, secrets = [] } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: fileURLToPath(root),
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const safeArgs = args.map((arg) => redact(arg, secrets));
    const detail = capture ? redact(`${result.stderr || result.stdout}`.trim(), secrets) : "";
    throw new Error(`supabase ${safeArgs.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return capture ? result.stdout : "";
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

async function applyRemoteSql(sql, artifactName) {
  const { postgresUrl } = requireRemoteConfig();
  writeFileSync(new URL(artifactName, artifacts), sql);
  if (activeRemoteClient) {
    await activeRemoteClient.query(sql);
    return;
  }
  await executeSql(postgresUrl, sql, { remote: true });
}

async function accountLoginCompatibilityState() {
  const [state] = await queryRemote(accountLoginCompatibilityStateSql);
  if (
    !state ||
    typeof state.table_exists !== "boolean" ||
    typeof state.function_exists !== "boolean"
  ) {
    throw new Error("Could not read remote Account login compatibility state.");
  }
  return {
    tableExists: state.table_exists,
    functionExists: state.function_exists,
  };
}

async function verifyAccountLoginCompatibility() {
  const state = classifyAccountLoginCompatibility(await accountLoginCompatibilityState());
  if (state !== "ready") throw new Error("Remote Account login compatibility is missing.");
  const [acceptance] = await queryRemote(accountLoginCompatibilityAcceptanceSql);
  if (
    !acceptance?.rls_enabled ||
    !acceptance.line_app_select ||
    !acceptance.line_app_insert ||
    !acceptance.line_app_update ||
    acceptance.anon_select ||
    acceptance.authenticated_select ||
    !acceptance.line_app_execute
  ) {
    throw new Error("Remote Account login compatibility privileges or RLS are invalid.");
  }
}

async function ensureAccountLoginCompatibility() {
  const state = classifyAccountLoginCompatibility(await accountLoginCompatibilityState());
  if (state === "ready") {
    await verifyAccountLoginCompatibility();
    return false;
  }
  if (state === "partial") return false;
  await applyRemoteSql(
    `BEGIN;\n${accountLoginExpansionSql()}\nCOMMIT;\n`,
    "account-login-compat.sql",
  );
  await verifyAccountLoginCompatibility();
  return true;
}

async function dailyCheckInCompatibilityState() {
  const [state] = await queryRemote(dailyCheckInCompatibilityStateSql);
  if (
    !state ||
    typeof state.table_exists !== "boolean" ||
    typeof state.function_exists !== "boolean" ||
    typeof state.trigger_exists !== "boolean"
  ) {
    throw new Error("Could not read remote DailyCheckIn compatibility state.");
  }
  return {
    tableExists: state.table_exists,
    functionExists: state.function_exists,
    triggerExists: state.trigger_exists,
  };
}

async function verifyDailyCheckInCompatibility() {
  const state = classifyDailyCheckInCompatibility(await dailyCheckInCompatibilityState());
  if (state !== "ready") throw new Error("Remote DailyCheckIn compatibility is missing.");
  const [acceptance] = await queryRemote(dailyCheckInCompatibilityAcceptanceSql);
  if (
    !acceptance?.rls_enabled ||
    !acceptance.line_app_select ||
    !acceptance.line_app_insert ||
    acceptance.anon_select ||
    acceptance.authenticated_select ||
    !acceptance.line_app_execute ||
    !acceptance.parity_trigger_enabled ||
    !acceptance.user_fk_exists
  ) {
    throw new Error("Remote DailyCheckIn compatibility privileges or invariants are invalid.");
  }
}

async function ensureDailyCheckInCompatibility() {
  const state = classifyDailyCheckInCompatibility(await dailyCheckInCompatibilityState());
  if (state === "ready") {
    await verifyDailyCheckInCompatibility();
    return false;
  }
  if (state === "partial") {
    throw new Error(
      "Remote DailyCheckIn compatibility is partial; refusing to guess a mixed authority state.",
    );
  }
  await applyRemoteSql(
    `BEGIN;\n${dailyCheckInCompatibilitySql()}\nCOMMIT;\n`,
    "daily-check-in-compat.sql",
  );
  await verifyDailyCheckInCompatibility();
  return true;
}

async function ensurePermissionSubjectVersionCompatibility() {
  return withRemoteClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("LOCK TABLE app_private.users IN SHARE ROW EXCLUSIVE MODE");
      const [state] = (
        await client.query(`
          select
            to_regclass('app_private.permission_subject_versions') is not null as table_exists,
            exists(
              select 1 from information_schema.columns
              where table_schema='app_private' and table_name='users'
                and column_name='permissions_version'
            ) as legacy_version_column
        `)
      ).rows;

      let changed = false;
      if (!state.table_exists) {
        await client.query(permissionSubjectVersionExpansionSql());
        if (state.legacy_version_column) {
          await client.query(`
            insert into app_private.permission_subject_versions(user_id,version)
            select id,permissions_version from app_private.users
            on conflict(user_id) do nothing
          `);
        }
        changed = true;
      }

      if (state.legacy_version_column) {
        const mismatch = Number(
          (
            await client.query(`
              select count(*)::int as count
              from app_private.users u
              join app_private.permission_subject_versions v on v.user_id=u.id
              where v.version<>u.permissions_version
            `)
          ).rows[0]?.count ?? 0,
        );
        if (mismatch) {
          throw new Error(
            "Legacy users.permissions_version disagrees with permission_subject_versions; refusing ambiguous authority.",
          );
        }
      }

      const [acceptance] = (
        await client.query(`
          select
            c.relrowsecurity as rls_enabled,
            has_table_privilege(
              'line_app','app_private.permission_subject_versions','SELECT'
            ) as line_app_select,
            has_table_privilege(
              'line_app','app_private.permission_subject_versions','INSERT'
            ) as line_app_insert,
            has_table_privilege(
              'line_app','app_private.permission_subject_versions','UPDATE'
            ) as line_app_update,
            not has_table_privilege(
              'anon','app_private.permission_subject_versions','SELECT'
            ) as anon_no_select,
            not has_table_privilege(
              'authenticated','app_private.permission_subject_versions','SELECT'
            ) as authenticated_no_select
          from pg_class c
          where c.oid='app_private.permission_subject_versions'::regclass
        `)
      ).rows;
      if (
        !acceptance?.rls_enabled ||
        !acceptance.line_app_select ||
        !acceptance.line_app_insert ||
        !acceptance.line_app_update ||
        !acceptance.anon_no_select ||
        !acceptance.authenticated_no_select
      ) {
        throw new Error("Remote permission subject version compatibility is invalid.");
      }

      const rowCount = Number(
        (
          await client.query(
            "select count(*)::int as count from app_private.permission_subject_versions",
          )
        ).rows[0]?.count ?? 0,
      );
      await client.query("COMMIT");
      writeFileSync(
        new URL("permission-subject-version-compat.json", artifacts),
        `${JSON.stringify(
          {
            changed,
            legacyVersionColumn: state.legacy_version_column,
            subjectVersionRows: rowCount,
          },
          null,
          2,
        )}\n`,
      );
      return changed;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

async function repositoryRuntimeCompatibilityState(client) {
  const row = (
    await client.query(`
      select
        (select count(*)::int from app_private.repositories) as repository_rows,
        (select count(*)::int from app_private.issues) as issue_rows,
        (select count(*)::int from app_private.discussions) as discussion_rows,
        (select count(*)::int from app_private.discussion_comments) as discussion_comment_rows,
        exists(
          select 1 from information_schema.columns
          where table_schema='app_private' and table_name='repositories'
            and column_name='owner_account_id'
        ) as owner_account_id_column,
        exists(
          select 1 from information_schema.columns
          where table_schema='app_private' and table_name='repositories'
            and column_name='owner_account_kind'
        ) as owner_account_kind_column,
        exists(
          select 1 from information_schema.columns
          where table_schema='app_private' and table_name='repositories'
            and column_name='next_issue_number'
        ) as next_issue_number_column,
        exists(
          select 1 from information_schema.columns
          where table_schema='app_private' and table_name='repositories'
            and column_name='organization_id'
        ) as legacy_organization_id_column,
        to_regclass('app_private.repository_access') is not null as repository_access_table,
        to_regclass('app_private.repository_team_access') is not null as repository_team_access_table,
        to_regclass('app_private.repository_stars') is not null as repository_stars_table,
        to_regclass('app_private.repository_commands') is not null as repository_commands_table,
        to_regclass('app_private.repository_labels') is not null as repository_labels_table,
        to_regclass('app_private.repository_milestones') is not null as repository_milestones_table,
        exists(
          select 1 from information_schema.columns
          where table_schema='app_private' and table_name='issues' and column_name='number'
        ) as issue_number_column,
        exists(
          select 1 from information_schema.columns
          where table_schema='app_private' and table_name='issues' and column_name='milestone_id'
        ) as issue_milestone_column,
        to_regclass('app_private.repository_effective_access') is not null
          as repository_effective_access_view,
        to_regprocedure('app_private.provision_repository(text,text,text,text,text)') is not null
          as provision_repository_function
    `)
  ).rows[0];
  return {
    repositoryRows: Number(row.repository_rows),
    issueRows: Number(row.issue_rows),
    discussionRows: Number(row.discussion_rows),
    discussionCommentRows: Number(row.discussion_comment_rows),
    ownerAccountIdColumn: row.owner_account_id_column,
    ownerAccountKindColumn: row.owner_account_kind_column,
    nextIssueNumberColumn: row.next_issue_number_column,
    legacyOrganizationIdColumn: row.legacy_organization_id_column,
    repositoryAccessTable: row.repository_access_table,
    repositoryTeamAccessTable: row.repository_team_access_table,
    repositoryStarsTable: row.repository_stars_table,
    repositoryCommandsTable: row.repository_commands_table,
    repositoryLabelsTable: row.repository_labels_table,
    repositoryMilestonesTable: row.repository_milestones_table,
    issueNumberColumn: row.issue_number_column,
    issueMilestoneColumn: row.issue_milestone_column,
    repositoryEffectiveAccessView: row.repository_effective_access_view,
    provisionRepositoryFunction: row.provision_repository_function,
  };
}

async function verifyRepositoryRuntimeCompatibility(client) {
  const state = await repositoryRuntimeCompatibilityState(client);
  if (classifyRepositoryRuntimeCompatibility(state) !== "ready") {
    throw new Error("Remote Repository runtime compatibility is incomplete.");
  }
  const [acceptance] = (
    await client.query(`
      select
        has_table_privilege('line_app','app_private.repositories','SELECT') as repository_select,
        not has_table_privilege('line_app','app_private.repositories','INSERT') as repository_no_insert,
        has_column_privilege(
          'line_app','app_private.repositories','next_issue_number','UPDATE'
        ) as repository_issue_number_update,
        has_table_privilege('line_app','app_private.repository_access','SELECT') as access_select,
        not has_table_privilege('line_app','app_private.repository_access','INSERT') as access_no_insert,
        has_table_privilege('line_app','app_private.repository_stars','SELECT') as stars_select,
        has_table_privilege('line_app','app_private.repository_stars','INSERT') as stars_insert,
        has_table_privilege('line_app','app_private.repository_stars','DELETE') as stars_delete,
        has_table_privilege(
          'line_app','app_private.repository_commands','SELECT'
        ) as commands_select,
        has_table_privilege(
          'line_app','app_private.repository_commands','INSERT'
        ) as commands_insert,
        not has_table_privilege(
          'anon','app_private.repository_commands','SELECT'
        ) as anon_no_commands,
        not has_table_privilege('anon','app_private.repository_stars','SELECT') as anon_no_stars,
        (
          select c.relrowsecurity
          from pg_class c
          where c.oid='app_private.repository_stars'::regclass
        ) as stars_rls,
        (
          select c.relrowsecurity
          from pg_class c
          where c.oid='app_private.repository_team_access'::regclass
        ) as team_access_rls,
        has_function_privilege(
          'line_app',
          'app_private.provision_repository(text,text,text,text,text)',
          'EXECUTE'
        ) as provision_execute,
        not has_function_privilege(
          'anon',
          'app_private.provision_repository(text,text,text,text,text)',
          'EXECUTE'
        ) as anon_no_provision,
        not has_schema_privilege('anon','app_private','USAGE') as anon_no_private_usage
    `)
  ).rows;
  if (
    !acceptance?.repository_select ||
    !acceptance.repository_no_insert ||
    !acceptance.repository_issue_number_update ||
    !acceptance.access_select ||
    !acceptance.access_no_insert ||
    !acceptance.stars_select ||
    !acceptance.stars_insert ||
    !acceptance.stars_delete ||
    !acceptance.commands_select ||
    !acceptance.commands_insert ||
    !acceptance.anon_no_commands ||
    !acceptance.anon_no_stars ||
    !acceptance.stars_rls ||
    !acceptance.team_access_rls ||
    !acceptance.provision_execute ||
    !acceptance.anon_no_provision ||
    !acceptance.anon_no_private_usage
  ) {
    throw new Error("Remote Repository runtime privileges or authorization boundary are invalid.");
  }
}

async function ensureRepositoryRuntimeCompatibility() {
  return withRemoteClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        "LOCK TABLE app_private.repositories, app_private.repository_access IN ACCESS EXCLUSIVE MODE",
      );
      const before = await repositoryRuntimeCompatibilityState(client);
      const classification = classifyRepositoryRuntimeCompatibility(before);
      if (classification === "ready") {
        await verifyRepositoryRuntimeCompatibility(client);
        await client.query("COMMIT");
        writeFileSync(
          new URL("repository-runtime-compat.json", artifacts),
          `${JSON.stringify(
            {
              before: {
                classification,
                repositoryRows: before.repositoryRows,
                legacyOrganizationIdColumn: before.legacyOrganizationIdColumn,
              },
              after: {
                classification,
                repositoryRows: before.repositoryRows,
                legacyOrganizationIdColumn: before.legacyOrganizationIdColumn,
              },
              changed: false,
            },
            null,
            2,
          )}\n`,
        );
        return false;
      }
      if (classification !== "repairable") {
        throw new Error(
          "Remote Repository runtime compatibility is partial or contains retained rows; refusing an unsafe automatic cutover.",
        );
      }

      let changed = false;
      if (!before.ownerAccountIdColumn || !before.ownerAccountKindColumn) {
        if (before.repositoryRows !== 0 || !before.legacyOrganizationIdColumn) {
          throw new Error(
            "Repository owner migration requires zero legacy Repository rows for automatic recovery.",
          );
        }
        await client.query(
          "alter table app_private.repositories add column owner_account_id text not null",
        );
        await client.query(
          "alter table app_private.repositories add column owner_account_kind text not null",
        );
        changed = true;
      }
      if (!before.nextIssueNumberColumn) {
        await client.query(
          "alter table app_private.repositories add column next_issue_number bigint not null default 1",
        );
        changed = true;
      }
      if (before.legacyOrganizationIdColumn) {
        if (before.repositoryRows !== 0) {
          throw new Error(
            "Legacy repositories.organization_id cannot be removed while Repository rows exist.",
          );
        }
        await client.query("alter table app_private.repositories drop column organization_id");
        changed = true;
      }

      const constraints = new Set(
        (
          await client.query(
            "select conname from pg_constraint where conrelid='app_private.repositories'::regclass",
          )
        ).rows.map((row) => row.conname),
      );
      if (!constraints.has("repositories_id_owner_account_id_key")) {
        await client.query(
          "alter table app_private.repositories add constraint repositories_id_owner_account_id_key unique (id,owner_account_id)",
        );
        changed = true;
      }
      if (!constraints.has("repositories_owner_kind_check")) {
        await client.query(
          "alter table app_private.repositories add constraint repositories_owner_kind_check check (owner_account_kind in ('USER','ORGANIZATION'))",
        );
        changed = true;
      }
      if (!constraints.has("repositories_next_issue_number_check")) {
        await client.query(
          "alter table app_private.repositories add constraint repositories_next_issue_number_check check (next_issue_number > 0)",
        );
        changed = true;
      }
      if (!constraints.has("repositories_owner_account_fkey")) {
        await client.query(
          "alter table app_private.repositories add constraint repositories_owner_account_fkey foreign key (owner_account_id,owner_account_kind) references app_private.accounts(id,kind)",
        );
        changed = true;
      }

      await client.query(
        "create unique index if not exists repositories_owner_name on app_private.repositories(owner_account_id,lower(name))",
      );
      await client.query(
        "revoke all on app_private.repositories from public, anon, authenticated, line_app",
      );
      await client.query("grant select on app_private.repositories to line_app");
      await client.query(
        "grant update (next_issue_number) on app_private.repositories to line_app",
      );
      await client.query("drop policy if exists backend on app_private.repositories");
      await client.query("drop policy if exists backend_read on app_private.repositories");
      await client.query("drop policy if exists backend_issue_number on app_private.repositories");
      await client.query(
        "create policy backend_read on app_private.repositories for select to line_app using (true)",
      );
      await client.query(
        "create policy backend_issue_number on app_private.repositories for update to line_app using (true) with check (true)",
      );

      await client.query(
        "revoke all on app_private.repository_access from public, anon, authenticated, line_app",
      );
      await client.query("grant select on app_private.repository_access to line_app");
      await client.query("drop policy if exists backend on app_private.repository_access");
      await client.query("drop policy if exists backend_read on app_private.repository_access");
      await client.query(
        "create policy backend_read on app_private.repository_access for select to line_app using (true)",
      );

      const afterStructure = await repositoryRuntimeCompatibilityState(client);
      if (!afterStructure.repositoryTeamAccessTable) {
        await client.query(repositoryTeamAccessSchemaSql);
        changed = true;
      }
      if (!afterStructure.repositoryStarsTable) {
        await client.query(repositoryStarsSchemaSql);
        changed = true;
      }
      if (!afterStructure.repositoryCommandsTable) {
        await client.query(repositoryCommandSchemaSql);
        changed = true;
      }
      if (!afterStructure.repositoryLabelsTable) {
        await client.query(repositoryLabelSchemaSql);
        changed = true;
      }
      if (!afterStructure.repositoryMilestonesTable) {
        await client.query(repositoryMilestoneSchemaSql);
        changed = true;
      }

      if (!afterStructure.issueNumberColumn || !afterStructure.issueMilestoneColumn) {
        if (afterStructure.issueRows !== 0) {
          throw new Error(
            "Issue runtime migration requires zero legacy Issue rows for automatic recovery.",
          );
        }
        if (!afterStructure.issueNumberColumn) {
          await client.query("alter table app_private.issues add column number bigint not null");
          changed = true;
        }
        if (!afterStructure.issueMilestoneColumn) {
          await client.query("alter table app_private.issues add column milestone_id text");
          changed = true;
        }
      }

      const issueConstraints = new Set(
        (
          await client.query(
            "select conname from pg_constraint where conrelid='app_private.issues'::regclass",
          )
        ).rows.map((row) => row.conname),
      );
      if (!issueConstraints.has("issues_repository_id_number_unique")) {
        await client.query(
          "alter table app_private.issues add constraint issues_repository_id_number_unique unique (repository_id,number)",
        );
        changed = true;
      }
      if (!issueConstraints.has("issues_number_check")) {
        await client.query(
          "alter table app_private.issues add constraint issues_number_check check (number > 0)",
        );
        changed = true;
      }
      if (!issueConstraints.has("issues_milestone_scope_fkey")) {
        await client.query(
          "alter table app_private.issues add constraint issues_milestone_scope_fkey foreign key (repository_id,milestone_id) references app_private.repository_milestones(repository_id,id)",
        );
        changed = true;
      }

      await client.query(
        "revoke all on app_private.issues from public, anon, authenticated, line_app",
      );
      await client.query("grant select on app_private.issues to line_app");
      await client.query(
        "grant insert (id,repository_id,number,publisher,assignee,title,criteria,status,version,created_at,updated_at) on app_private.issues to line_app",
      );
      await client.query(
        "grant update (status,version,updated_at) on app_private.issues to line_app",
      );
      await client.query("drop policy if exists backend on app_private.issues");
      await client.query("drop policy if exists backend_read on app_private.issues");
      await client.query("drop policy if exists backend_insert on app_private.issues");
      await client.query("drop policy if exists backend_transition on app_private.issues");
      await client.query(
        "create policy backend_read on app_private.issues for select to line_app using (true)",
      );
      await client.query(
        "create policy backend_insert on app_private.issues for insert to line_app with check (true)",
      );
      await client.query(
        "create policy backend_transition on app_private.issues for update to line_app using (true) with check (true)",
      );

      for (const relation of ["discussions", "discussion_comments"]) {
        await client.query(
          `revoke all on app_private.${relation} from public, anon, authenticated, line_app`,
        );
        await client.query(`grant select on app_private.${relation} to line_app`);
        await client.query(`drop policy if exists backend on app_private.${relation}`);
        await client.query(`drop policy if exists backend_read on app_private.${relation}`);
        await client.query(
          `create policy backend_read on app_private.${relation} for select to line_app using (true)`,
        );
      }

      if (!afterStructure.repositoryEffectiveAccessView) {
        await client.query(repositoryEffectiveAccessExpansionSql());
        changed = true;
      }

      await client.query(repositoryProvisionCompatibilitySql());
      await client.query(repositoryProvisionCompatibilityAccessSql());

      await verifyRepositoryRuntimeCompatibility(client);
      const after = await repositoryRuntimeCompatibilityState(client);
      if (after.repositoryRows !== before.repositoryRows) {
        throw new Error("Repository runtime compatibility repair changed Repository business rows.");
      }
      await client.query("COMMIT");
      writeFileSync(
        new URL("repository-runtime-compat.json", artifacts),
        `${JSON.stringify(
          {
            before: {
              classification,
              repositoryRows: before.repositoryRows,
              legacyOrganizationIdColumn: before.legacyOrganizationIdColumn,
            },
            after: {
              classification: classifyRepositoryRuntimeCompatibility(after),
              repositoryRows: after.repositoryRows,
              legacyOrganizationIdColumn: after.legacyOrganizationIdColumn,
            },
            changed,
          },
          null,
          2,
        )}\n`,
      );
      return changed;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

async function repairRuntimeCompatibility() {
  const accountLoginChanged = await ensureAccountLoginCompatibility();
  const dailyCheckInChanged = await ensureDailyCheckInCompatibility();
  const permissionChanged = await ensurePermissionSubjectVersionCompatibility();
  const repositoryChanged = await ensureRepositoryRuntimeCompatibility();
  return accountLoginChanged || dailyCheckInChanged || permissionChanged || repositoryChanged;
}

async function prepareGeneralManagementExpansion() {
  const legacyEnterpriseMetadata = parseLegacyEnterpriseMetadata(
    process.env.SUPABASE_LEGACY_ENTERPRISE_NAME ?? "",
    process.env.SUPABASE_LEGACY_ENTERPRISE_SLUG ?? "",
  );
  const { postgresUrl } = requireRemoteConfig();

  return withPostgres(postgresUrl, { remote: true }, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("select pg_advisory_xact_lock(71020260924::bigint)");

      const relationState = (
        await client.query(`
          select
            to_regclass('app_private.bot_accounts') is not null as bot_accounts_exists,
            to_regclass('app_private.bot_account_provisioning_receipts') is not null as bot_receipts_exists,
            to_regclass('app_private.project_issue_references') is not null as project_issue_references_exists,
            to_regclass('app_private.permission_subject_versions') is not null as permission_subject_versions_exists
        `)
      ).rows[0];

      const lockNames = [
        "accounts",
        "users",
        "enterprises",
        "organizations",
        "repositories",
        "issues",
        "teams",
        "enterprise_teams",
        "permission_grants",
        ...(relationState.bot_accounts_exists ? ["bot_accounts"] : []),
        ...(relationState.bot_receipts_exists ? ["bot_account_provisioning_receipts"] : []),
        ...(relationState.project_issue_references_exists ? ["project_issue_references"] : []),
      ];
      await client.query(
        `LOCK TABLE ${lockNames.map((name) => `app_private."${name}"`).join(", ")} IN ACCESS EXCLUSIVE MODE`,
      );

      const columnRows = (
        await client.query(`
          select table_name,column_name
          from information_schema.columns
          where table_schema='app_private'
            and table_name in (
              'enterprises','organizations','repositories','issues','teams','enterprise_teams','users'
            )
        `)
      ).rows;
      const columns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
      const hasColumn = (table, column) => columns.has(`${table}.${column}`);
      const count = async (sql, params = []) =>
        Number((await client.query(sql, params)).rows[0]?.count ?? 0);

      const enterpriseRows = (
        await client.query(`
          select account_id,
                 ${hasColumn("enterprises", "name") ? "name" : "null::text"} as name,
                 ${hasColumn("enterprises", "slug") ? "slug" : "null::text"} as slug
          from app_private.enterprises
          order by account_id
        `)
      ).rows.map((row) => ({ accountId: row.account_id, name: row.name, slug: row.slug }));
      const enterpriseMetadataRows = enterpriseRows.filter(
        (row) => row.name == null || row.slug == null,
      );

      const permissionNames = permissionNamesFromSource();
      const state = {
        botAccountRoots: await count("select count(*) from app_private.accounts where kind='BOT'"),
        botAccounts: relationState.bot_accounts_exists
          ? await count("select count(*) from app_private.bot_accounts")
          : 0,
        botReceipts: relationState.bot_receipts_exists
          ? await count("select count(*) from app_private.bot_account_provisioning_receipts")
          : 0,
        projectIssueReferences: relationState.project_issue_references_exists
          ? await count("select count(*) from app_private.project_issue_references")
          : 0,
        repositoriesNeedingOwnerMigration:
          hasColumn("repositories", "organization_id") &&
          (!hasColumn("repositories", "owner_account_id") ||
            !hasColumn("repositories", "owner_account_kind"))
            ? await count("select count(*) from app_private.repositories")
            : 0,
        issuesNeedingNumber: !hasColumn("issues", "number")
          ? await count("select count(*) from app_private.issues")
          : 0,
        organizationsNeedingName: !hasColumn("organizations", "name")
          ? await count("select count(*) from app_private.organizations")
          : 0,
        teamsNeedingSlug: !hasColumn("teams", "slug")
          ? await count("select count(*) from app_private.teams")
          : 0,
        enterpriseTeamsNeedingSlug: !hasColumn("enterprise_teams", "slug")
          ? await count("select count(*) from app_private.enterprise_teams")
          : 0,
        invalidPermissions: await count(
          "select count(*) from app_private.permission_grants where not (permission::text = any($1::text[]))",
          [permissionNames],
        ),
        enterpriseRows,
        enterpriseMetadataRows,
      };
      assertGeneralManagementExpansionState(state);
      const metadata = resolveLegacyEnterpriseMetadata(state, legacyEnterpriseMetadata);

      let changed = false;
      if (!hasColumn("enterprises", "name")) {
        await client.query("alter table app_private.enterprises add column name text");
        changed = true;
      }
      if (!hasColumn("enterprises", "slug")) {
        await client.query("alter table app_private.enterprises add column slug text");
        changed = true;
      }
      for (const entry of metadata) {
        await client.query(
          `update app_private.enterprises
             set name=coalesce(name,$2), slug=coalesce(slug,$3)
           where account_id=$1`,
          [entry.accountId, entry.name, entry.slug],
        );
      }

      const invalidEnterprise = await count(`
        select count(*) from app_private.enterprises
        where name is null
           or length(btrim(name)) not between 1 and 120
           or slug is null
           or slug <> lower(slug)
           or length(slug) not between 1 and 39
           or slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
      `);
      const duplicateEnterpriseSlug = await count(`
        select count(*) from (
          select slug from app_private.enterprises
          where slug is not null
          group by slug having count(*) > 1
        ) duplicates
      `);
      if (invalidEnterprise || duplicateEnterpriseSlug) {
        throw new Error(
          "Enterprise metadata backfill does not satisfy the current target contract.",
        );
      }

      const constraintRows = (
        await client.query(`
          select conname
          from pg_constraint
          where connamespace='app_private'::regnamespace
            and conrelid in (
              'app_private.enterprises'::regclass,
              'app_private.organizations'::regclass
            )
        `)
      ).rows;
      const constraints = new Set(constraintRows.map((row) => row.conname));
      if (!constraints.has("enterprises_name_check")) {
        await client.query(
          "alter table app_private.enterprises add constraint enterprises_name_check check (length(btrim(name)) between 1 and 120)",
        );
        changed = true;
      }
      if (!constraints.has("enterprises_slug_check")) {
        await client.query(
          "alter table app_private.enterprises add constraint enterprises_slug_check check (slug = lower(slug) and length(slug) between 1 and 39 and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')",
        );
        changed = true;
      }
      if (!constraints.has("enterprises_slug_key")) {
        await client.query(
          "alter table app_private.enterprises add constraint enterprises_slug_key unique (slug)",
        );
        changed = true;
      }

      if (!hasColumn("organizations", "name")) {
        await client.query("alter table app_private.organizations add column name text");
        changed = true;
      }
      if (!constraints.has("organizations_name_check")) {
        await client.query(
          "alter table app_private.organizations add constraint organizations_name_check check (length(btrim(name)) between 1 and 120)",
        );
        changed = true;
      }

      if (!relationState.permission_subject_versions_exists) {
        await client.query(permissionSubjectVersionExpansionSql());
        changed = true;
      }
      if (hasColumn("users", "permissions_version")) {
        const mismatch = await count(`
          select count(*)
          from app_private.users u
          join app_private.permission_subject_versions v on v.user_id=u.id
          where v.version<>u.permissions_version
        `);
        if (mismatch) {
          throw new Error(
            "Legacy users.permissions_version disagrees with permission_subject_versions; refusing ambiguous authority.",
          );
        }
        await client.query(`
          insert into app_private.permission_subject_versions(user_id,version)
          select id,permissions_version from app_private.users
          on conflict(user_id) do nothing
        `);
      }

      await client.query(governanceCompatibilityFunctionSql());
      await client.query(governanceCompatibilityAccessSql());

      await client.query("COMMIT");
      writeFileSync(
        new URL("general-management-prepare.json", artifacts),
        `${JSON.stringify(
          {
            enterpriseMetadataRows: enterpriseMetadataRows.length,
            unsupportedLegacyRows: 0,
            changed,
          },
          null,
          2,
        )}\n`,
      );
      return changed || metadata.length > 0;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
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
      "Supabase provider recovery is unavailable: no PITR/WALG capability and no completed managed backup. Refusing destructive manual reconciliation.",
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
      `Supabase recovery readback failed with HTTP ${response.status}; refusing destructive manual reconciliation.`,
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
}

export function parseArgs(argv) {
  const [command = "sync", ...flags] = argv;
  if (!["repair", "prepare", "plan", "recovery", "sync", "verify"].includes(command)) {
    throw new Error(
      "Usage: schema:remote [repair|prepare|plan|recovery|sync|verify] [--reviewed-plan] [--api]",
    );
  }
  for (const flag of flags) {
    if (!["--reviewed-plan", "--api"].includes(flag)) {
      throw new Error(
        "Usage: schema:remote [repair|prepare|plan|recovery|sync|verify] [--reviewed-plan] [--api]",
      );
    }
  }
  const api = flags.includes("--api");
  if (api && command !== "verify") {
    throw new Error("schema:remote --api is only valid with verify.");
  }
  return { command, reviewedPlan: flags.includes("--reviewed-plan"), api };
}

async function runRemoteCommand({ projectRef, command, reviewedPlan, api }) {
  mkdirSync(artifacts, { recursive: true });

  await assertPlatformPrerequisites();
  const before = await migrationHistory();
  writeFileSync(new URL("migration-history.before.txt", artifacts), `${before}\n`);

  let foundationState = classifyRemoteFoundationState(await remoteFoundationState());
  if (foundationState === "repairable") {
    if (command === "verify") {
      throw new Error("Remote foundation drift detected: line_app is missing.");
    }
    if (command !== "plan") {
      await applyRemoteSql(`BEGIN;\n${foundationSql}\nCOMMIT;\n`, "foundation-repair.sql");
      foundationState = classifyRemoteFoundationState(await remoteFoundationState());
      if (foundationState !== "existing") {
        throw new Error("Remote foundation repair did not converge.");
      }
    }
  }
  if (command === "repair" || command === "prepare") {
    if (foundationState !== "existing") {
      throw new Error("Remote compatibility repair requires an existing app foundation.");
    }
    const runtimeChanged = await repairRuntimeCompatibility();
    if (command === "repair") {
      const after = await migrationHistory();
      writeFileSync(new URL("migration-history.after.txt", artifacts), `${after}\n`);
      assertMigrationHistoryUnchanged(before, after);
      console.log(
        `Remote repair PASS for ${projectRef}: runtime compatibility = ${
          runtimeChanged ? "repaired" : "already current"
        }; reviewed-plan contract not executed; migration history drift = 0.`,
      );
      return;
    }
    const generalManagementChanged = await prepareGeneralManagementExpansion();
    const changed = runtimeChanged || generalManagementChanged;
    const after = await migrationHistory();
    writeFileSync(new URL("migration-history.after.txt", artifacts), `${after}\n`);
    assertMigrationHistoryUnchanged(before, after);
    console.log(
      `Remote prepare PASS for ${projectRef}: preserve-data expansion = ${
        changed ? "applied" : "already current"
      }; reviewed-plan contract not executed; migration history drift = 0.`,
    );
    return;
  }

  await rebuildDesiredLocal();

  if (foundationState === "fresh") {
    if (reviewedPlan) {
      throw new Error("Reviewed-plan reconciliation requires an existing remote foundation.");
    }
    if (command === "plan") {
      console.log(
        `Remote target: ${projectRef}; foundation: fresh. Full application bootstrap will apply ${schemaFileNames().join(", ")} in one transaction; Supabase platform state and migration history stay outside the mutation boundary.`,
      );
      return;
    }
    if (command === "verify") {
      throw new Error(
        "Remote schema drift detected: app_private and line_app are not bootstrapped.",
      );
    }
    await applyRemoteSql(`BEGIN;\n${declaredSchemaSql()}\nCOMMIT;\n`, "bootstrap.sql");
  } else {
    const plan = generatePlan();
    const classification = classifyPlan(plan.sql);
    if (command === "plan") {
      console.log(`Remote target: ${projectRef}; foundation: existing.`);
      console.log(
        `Plan classification: ${classification.mode}; fingerprint: ${plan.fingerprint}; reasons: ${
          classification.reasons.join(", ") || "none"
        }.`,
      );
      console.log(plan.sql || "Remote app_private schema already matches supabase/schemas.");
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

    const syncClassification = authorizeSyncPlan(
      plan.sql,
      reviewedPlan ? process.env.SUPABASE_REVIEWED_PLAN_SHA256 : undefined,
    );
    console.log(
      `Remote sync authorization: validated declarative source; diagnostic classification = ${syncClassification.mode}; reasons = ${syncClassification.reasons.join(", ") || "none"}.`,
    );

    await applyRemoteSql(
      `BEGIN;\n${foundationSql}\n${classification.empty ? "" : plan.sql}\nCOMMIT;\n`,
      "apply.sql",
    );
  }

  const after = await migrationHistory();
  writeFileSync(new URL("migration-history.after.txt", artifacts), `${after}\n`);
  assertMigrationHistoryUnchanged(before, after);

  const verification = generatePlan("verification.sql");
  if (!classifyPlan(verification.sql).empty) {
    throw new Error(`Remote sync left schema drift; see ${verification.path}`);
  }
  await verifyRemoteAcceptance();
  console.log(
    `Remote sync PASS for ${projectRef}: schema drift = 0; ownership/security readback = PASS; migration history drift = 0.`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  loadRootEnv();
  const { command, reviewedPlan, api } = parseArgs(argv);

  if (command === "recovery") {
    mkdirSync(artifacts, { recursive: true });
    const evidence = await verifySupabaseRecoveryReadback();
    writeFileSync(
      new URL("recovery-readback.json", artifacts),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(
      `Supabase recovery PASS for ${evidence.projectRef}: PITR = ${evidence.pitrEnabled}; WALG = ${evidence.walgEnabled}; completed managed backups = ${evidence.completedBackupCount}.`,
    );
    return;
  }

  const { projectRef } = requireRemoteConfig();
  const execute = () => runRemoteCommand({ projectRef, command, reviewedPlan, api });

  if (["repair", "prepare", "sync"].includes(command)) {
    return withRemoteReconciliationLock(execute);
  }
  return execute();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
