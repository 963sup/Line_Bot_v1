import assert from "node:assert/strict";
import test from "node:test";
import {
  accountLoginExpansionSql,
  assertConfirmedProject,
  assertGeneralManagementExpansionState,
  assertMigrationHistoryUnchanged,
  assertRemoteTarget,
  assertReviewedPlan,
  assertSupabaseRestReadback,
  classifyAccountLoginCompatibility,
  classifyDailyCheckInCompatibility,
  classifyPlan,
  classifyRemoteFoundationState,
  dailyCheckInCompatibilitySql,
  governanceCompatibilityAccessSql,
  governanceCompatibilityFunctionSql,
  parseArgs,
  parseEnterpriseMetadataBackfill,
  permissionNamesFromSource,
  permissionSubjectVersionExpansionSql,
  planFingerprint,
  projectRefFromSupabaseUrl,
  supabaseApiReadbackConfig,
  verifySupabaseApiReadback,
} from "./remote.mjs";

test("classifyPlan allows only known automatic DDL", () => {
  for (const sql of [
    "create table app_private.example(id bigint);",
    "alter table app_private.example add column note text;",
    "alter table app_private.example add constraint example_id_check check (id > 0);",
    'grant select on table "app_private"."x" to "postgres";',
    "revoke all on table app_private.x from public, anon, authenticated;",
    "create or replace function app_private.example() returns void language sql as $$ select null $$;",
  ]) {
    assert.equal(classifyPlan(sql).mode, "automatic", sql);
  }
});

test("classifyPlan requires manual review for destructive, security-sensitive and unknown DDL", () => {
  for (const sql of [
    "drop table app_private.example;",
    "alter table app_private.example drop column old_name;",
    "alter table app_private.example alter column value type bigint;",
    "alter table app_private.example alter column value set not null;",
    "alter table app_private.example add column value bigint not null;",
    "truncate app_private.example;",
    "alter table app_private.example rename column a to b;",
    "drop policy backend on app_private.example;",
    "grant select on table app_private.example to authenticated;",
    "revoke execute on function app_private.example() from line_app;",
    "select app_private.example();",
  ]) {
    assert.equal(classifyPlan(sql).mode, "manual", sql);
  }
});

test("classifyPlan ignores comments and quoted function bodies when classifying top-level SQL", () => {
  const sql = `
    -- drop table app_private.not_real;
    create or replace function app_private.example()
    returns text
    language sql
    as $function$
      select 'drop table app_private.also_not_real;';
    $function$;
  `;
  assert.deepEqual(classifyPlan(sql), {
    mode: "automatic",
    empty: false,
    reasons: [],
  });
});

test("empty plan is recognized as a no-op", () => {
  assert.deepEqual(classifyPlan("  \n-- comment only\n"), {
    mode: "noop",
    empty: true,
    reasons: [],
  });
});

test("reviewed plan fingerprint binds manual authorization to exact SQL", () => {
  const sql = "drop table app_private.example;\n";
  const fingerprint = planFingerprint(sql);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(assertReviewedPlan(sql, fingerprint), fingerprint);
  assert.throws(() => assertReviewedPlan(sql, "0".repeat(64)), /no longer matches/i);
  assert.throws(() => assertReviewedPlan(sql, "not-a-hash"), /exact lowercase SHA-256/i);
});

test("migration history must remain byte-stable modulo outer whitespace", () => {
  assert.doesNotThrow(() => assertMigrationHistoryUnchanged("ABSENT\n", "ABSENT"));
  assert.doesNotThrow(() => assertMigrationHistoryUnchanged("PRESENT:abc\n", "PRESENT:abc\n"));
  assert.throws(
    () => assertMigrationHistoryUnchanged("ABSENT", "PRESENT:abc"),
    /migration history/i,
  );
  assert.throws(
    () => assertMigrationHistoryUnchanged("PRESENT:abc", "PRESENT:def"),
    /migration history/i,
  );
});

test("parseArgs defaults to sync and exposes one explicit manual authorization flag", () => {
  assert.deepEqual(parseArgs([]), { command: "sync", allowManual: false, api: false });
  assert.throws(() => parseArgs(["compat"]), /Usage/);
  assert.deepEqual(parseArgs(["prepare"]), {
    command: "prepare",
    allowManual: false,
    api: false,
  });
  assert.deepEqual(parseArgs(["plan"]), { command: "plan", allowManual: false, api: false });
  assert.deepEqual(parseArgs(["sync", "--allow-manual"]), {
    command: "sync",
    allowManual: true,
    api: false,
  });
  assert.throws(() => parseArgs(["sync", "--allow-destructive"]), /Usage/);
  assert.deepEqual(parseArgs(["verify"]), {
    command: "verify",
    allowManual: false,
    api: false,
  });
  assert.deepEqual(parseArgs(["verify", "--api"]), {
    command: "verify",
    allowManual: false,
    api: true,
  });
  assert.throws(() => parseArgs(["sync", "--api"]), /only valid/);
  assert.throws(() => parseArgs(["verify", "--unknown"]), /Usage/);
});

test("Supabase project URL yields the exact project ref", () => {
  assert.equal(
    projectRefFromSupabaseUrl("https://nmssogphayjymjpbnrxv.supabase.co"),
    "nmssogphayjymjpbnrxv",
  );
  assert.throws(() => projectRefFromSupabaseUrl("https://example.com"), /SUPABASE_URL/);
});

test("Supabase API readback config is explicit and same-target", () => {
  assert.deepEqual(
    supabaseApiReadbackConfig({
      SUPABASE_URL: "https://nmssogphayjymjpbnrxv.supabase.co/",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    }),
    {
      supabaseUrl: "https://nmssogphayjymjpbnrxv.supabase.co",
      publishableKey: "publishable",
    },
  );
  assert.throws(
    () =>
      supabaseApiReadbackConfig({
        SUPABASE_URL: "https://nmssogphayjymjpbnrxv.supabase.co",
      }),
    /PUBLISHABLE_KEY/,
  );
  assert.throws(
    () =>
      supabaseApiReadbackConfig({
        SUPABASE_URL: "https://example.com",
        SUPABASE_PUBLISHABLE_KEY: "publishable",
      }),
    /SUPABASE_URL/,
  );
});

test("Supabase REST readback treats Google provider state as diagnostic evidence", () => {
  assert.deepEqual(
    assertSupabaseRestReadback({ usersStatus: 403, authStatus: 200, googleEnabled: false }),
    { publicDataApiDenied: true, googleEnabled: false },
  );
  assert.throws(
    () => assertSupabaseRestReadback({ usersStatus: 200, authStatus: 200, googleEnabled: true }),
    /public Data API/i,
  );
  assert.throws(
    () => assertSupabaseRestReadback({ usersStatus: 403, authStatus: 503, googleEnabled: true }),
    /Auth settings/i,
  );
});

test("Supabase API readback uses public key and bounded fetches", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, apikey: options.headers.apikey, hasSignal: Boolean(options.signal) });
    if (url.endsWith("/rest/v1/users?select=id&limit=1"))
      return new Response("{}", { status: 404 });
    if (url.endsWith("/auth/v1/settings")) {
      return Response.json({ external: { google: false } });
    }
    return new Response("unexpected", { status: 500 });
  };

  assert.deepEqual(
    await verifySupabaseApiReadback(
      {
        supabaseUrl: "https://nmssogphayjymjpbnrxv.supabase.co",
        publishableKey: "public-key",
      },
      fetchImpl,
    ),
    { publicDataApiDenied: true, googleEnabled: false },
  );
  assert.deepEqual(calls, [
    {
      url: "https://nmssogphayjymjpbnrxv.supabase.co/rest/v1/users?select=id&limit=1",
      apikey: "public-key",
      hasSignal: true,
    },
    {
      url: "https://nmssogphayjymjpbnrxv.supabase.co/auth/v1/settings",
      apikey: "public-key",
      hasSignal: true,
    },
  ]);
});

test("explicit project confirmation is mandatory and must match the URL-derived target", () => {
  assert.doesNotThrow(() => assertConfirmedProject("nmssogphayjymjpbnrxv", "nmssogphayjymjpbnrxv"));
  assert.throws(() => assertConfirmedProject("nmssogphayjymjpbnrxv", undefined), /exactly match/);
  assert.throws(
    () => assertConfirmedProject("nmssogphayjymjpbnrxv", "aaaaaaaaaaaaaaaaaaaa"),
    /exactly match/,
  );
});

test("remote target guard accepts direct and session-pooler URLs for the exact project", () => {
  for (const url of [
    "postgresql://postgres:secret@db.nmssogphayjymjpbnrxv.supabase.co:5432/postgres",
    "postgresql://postgres.nmssogphayjymjpbnrxv:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
  ]) {
    assert.equal(
      assertRemoteTarget("https://nmssogphayjymjpbnrxv.supabase.co", url),
      "nmssogphayjymjpbnrxv",
    );
  }
});

test("remote target guard rejects wrong project, database, and transaction pooler", () => {
  assert.throws(
    () =>
      assertRemoteTarget(
        "https://nmssogphayjymjpbnrxv.supabase.co",
        "postgresql://postgres:secret@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres",
      ),
    /does not target/,
  );
  assert.throws(
    () =>
      assertRemoteTarget(
        "https://nmssogphayjymjpbnrxv.supabase.co",
        "postgresql://postgres:secret@db.nmssogphayjymjpbnrxv.supabase.co:5432/other",
      ),
    /postgres database/,
  );
  assert.throws(
    () =>
      assertRemoteTarget(
        "https://nmssogphayjymjpbnrxv.supabase.co",
        "postgresql://postgres.nmssogphayjymjpbnrxv:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
      ),
    /transaction pooler/,
  );
});

test("remote foundation classifies repairable drift without confusing it with application state", () => {
  assert.equal(
    classifyRemoteFoundationState({ appPrivateExists: false, lineAppExists: false }),
    "fresh",
  );
  assert.equal(
    classifyRemoteFoundationState({ appPrivateExists: false, lineAppExists: true }),
    "fresh",
  );
  assert.equal(
    classifyRemoteFoundationState({ appPrivateExists: true, lineAppExists: true }),
    "existing",
  );
  assert.equal(
    classifyRemoteFoundationState({ appPrivateExists: true, lineAppExists: false }),
    "repairable",
  );
});

test("Account login compatibility expansion stays sourced from 101_account_logins.sql", () => {
  const sql = accountLoginExpansionSql();
  assert.match(sql, /create table app_private\.account_logins/);
  assert.match(sql, /create function app_private\.set_account_login/);
  assert.doesNotMatch(sql, /create table app_private\.accounts/);
});

test("Account login compatibility exposes partial state for the canonical diff reconciler", () => {
  assert.equal(
    classifyAccountLoginCompatibility({ tableExists: false, functionExists: false }),
    "missing",
  );
  assert.equal(
    classifyAccountLoginCompatibility({ tableExists: true, functionExists: true }),
    "ready",
  );
  assert.equal(
    classifyAccountLoginCompatibility({ tableExists: true, functionExists: false }),
    "partial",
  );
  assert.equal(
    classifyAccountLoginCompatibility({ tableExists: false, functionExists: true }),
    "partial",
  );
});

test("DailyCheckIn runtime compatibility stays sourced from canonical schema owners", () => {
  const sql = dailyCheckInCompatibilitySql();
  assert.match(sql, /create table app_private\.daily_check_in_claims/);
  assert.match(sql, /daily_check_in_claims_user_id_fkey/);
  assert.match(sql, /enforce_daily_check_in_claim_ledger_parity/);
  assert.match(sql, /daily_check_in_claim_requires_ledger/);
  assert.doesNotMatch(sql, /create table app_private\.\"asset_ledger_entries\"/);
});

test("DailyCheckIn compatibility distinguishes missing, ready and partial state", () => {
  assert.equal(
    classifyDailyCheckInCompatibility({
      tableExists: false,
      functionExists: false,
      triggerExists: false,
    }),
    "missing",
  );
  assert.equal(
    classifyDailyCheckInCompatibility({
      tableExists: true,
      functionExists: true,
      triggerExists: true,
    }),
    "ready",
  );
  assert.equal(
    classifyDailyCheckInCompatibility({
      tableExists: true,
      functionExists: false,
      triggerExists: false,
    }),
    "partial",
  );
});

test("Enterprise metadata backfill is explicit, exact, and bounded", () => {
  assert.deepEqual(parseEnterpriseMetadataBackfill(""), []);
  assert.deepEqual(
    parseEnterpriseMetadataBackfill(
      JSON.stringify([{ accountId: "enterprise-1", name: "Operations", slug: "operations" }]),
    ),
    [{ accountId: "enterprise-1", name: "Operations", slug: "operations" }],
  );
  for (const value of [
    "{}",
    JSON.stringify([{ accountId: "enterprise-1", name: "Operations", slug: "Operations" }]),
    JSON.stringify([{ accountId: "enterprise-1", name: "Operations", slug: "ops", extra: true }]),
    JSON.stringify([
      { accountId: "enterprise-1", name: "Operations", slug: "ops" },
      { accountId: "enterprise-2", name: "Other", slug: "ops" },
    ]),
  ]) {
    assert.throws(() => parseEnterpriseMetadataBackfill(value), /backfill|slug|array|entries/i);
  }
});

test("prepare derives permission and governance compatibility SQL from canonical schema sources", () => {
  assert.deepEqual(permissionNamesFromSource(), [
    "users.read",
    "users.suspend",
    "workplaces.manage",
    "partners.manage",
    "partners.review",
  ]);

  const versions = permissionSubjectVersionExpansionSql();
  assert.match(versions, /create table app_private\.permission_subject_versions/);
  assert.match(versions, /grant select, insert, update/i);
  assert.match(versions, /create policy backend/i);
  assert.doesNotMatch(versions, /permission_commands/);

  const functions = governanceCompatibilityFunctionSql();
  assert.match(
    functions,
    /provision_enterprise_scope\(\s*p_target_id text,\s*p_user_id text,\s*p_slug text,\s*p_name text,\s*p_requested_at bigint/s,
  );
  assert.match(
    functions,
    /provision_organization_scope\(\s*p_target_id text,\s*p_user_id text,\s*p_login text,\s*p_name text,\s*p_requested_at bigint/s,
  );
  assert.doesNotMatch(functions, /provision_bot_account/);

  const access = governanceCompatibilityAccessSql();
  assert.match(
    access,
    /grant execute on function app_private\.provision_enterprise_scope\(text,text,text,text,bigint\) to line_app/i,
  );
  assert.match(
    access,
    /revoke all on function app_private\.bootstrap_enterprise\(text,text,text,text,text,text,text,uuid,bigint\) from public, anon, authenticated, line_app/i,
  );
  assert.doesNotMatch(access, /provision_bot_account/);
});

function expansionState(overrides = {}) {
  const enterpriseRows = overrides.enterpriseRows ?? [
    { accountId: "enterprise-1", name: null, slug: null },
  ];
  return {
    botAccountRoots: 0,
    botAccounts: 0,
    botReceipts: 0,
    projectIssueReferences: 0,
    repositoriesNeedingOwnerMigration: 0,
    issuesNeedingNumber: 0,
    organizationsNeedingName: 0,
    teamsNeedingSlug: 0,
    enterpriseTeamsNeedingSlug: 0,
    invalidPermissions: 0,
    ...overrides,
    enterpriseRows,
    enterpriseMetadataRows: enterpriseRows.filter((row) => row.name == null || row.slug == null),
  };
}

test("general-management prepare accepts only evidence-complete preservable state", () => {
  assert.doesNotThrow(() =>
    assertGeneralManagementExpansionState(expansionState(), [
      { accountId: "enterprise-1", name: "Operations", slug: "operations" },
    ]),
  );

  assert.throws(
    () =>
      assertGeneralManagementExpansionState(expansionState({ projectIssueReferences: 1 }), [
        { accountId: "enterprise-1", name: "Operations", slug: "operations" },
      ]),
    /explicit owner migration/i,
  );
  assert.throws(
    () => assertGeneralManagementExpansionState(expansionState(), []),
    /missing required Enterprise metadata/i,
  );
  assert.throws(
    () =>
      assertGeneralManagementExpansionState(expansionState(), [
        { accountId: "enterprise-1", name: "Operations", slug: "operations" },
        { accountId: "enterprise-2", name: "Other", slug: "other" },
      ]),
    /unknown Enterprise/i,
  );
  assert.throws(
    () =>
      assertGeneralManagementExpansionState(
        expansionState({
          enterpriseRows: [{ accountId: "enterprise-1", name: "Existing", slug: null }],
        }),
        [{ accountId: "enterprise-1", name: "Different", slug: "operations" }],
      ),
    /conflicts/i,
  );
  assert.doesNotThrow(() =>
    assertGeneralManagementExpansionState(
      expansionState({
        enterpriseRows: [{ accountId: "enterprise-1", name: "Operations", slug: "operations" }],
      }),
      [{ accountId: "enterprise-1", name: "Operations", slug: "operations" }],
    ),
  );
});
