import assert from "node:assert/strict";
import test from "node:test";
import {
  accountLoginExpansionSql,
  assertConfirmedProject,
  assertGeneralManagementExpansionState,
  assertMigrationHistoryUnchanged,
  assertRemoteTarget,
  classifyAccountLoginCompatibility,
  classifyPlan,
  classifyRemoteFoundationState,
  governanceCompatibilityAccessSql,
  governanceCompatibilityFunctionSql,
  parseArgs,
  parseEnterpriseMetadataBackfill,
  permissionNamesFromSource,
  permissionSubjectVersionExpansionSql,
  projectRefFromSupabaseUrl,
} from "./remote.mjs";

test("classifyPlan accepts additive DDL", () => {
  assert.deepEqual(classifyPlan("create table app_private.example(id bigint);"), {
    destructive: false,
    empty: false,
  });
});

test("classifyPlan blocks destructive and data-sensitive DDL", () => {
  for (const sql of [
    "drop table app_private.example;",
    "alter table app_private.example drop column old_name;",
    "alter table app_private.example alter column value type bigint;",
    "alter table app_private.example alter column value set not null;",
    "alter table app_private.example add column value bigint not null;",
    "truncate app_private.example;",
    "alter table app_private.example rename column a to b;",
  ]) {
    assert.equal(classifyPlan(sql).destructive, true, sql);
  }
});

test("classifyPlan does not confuse GRANT TRUNCATE privilege with a TRUNCATE statement", () => {
  assert.equal(
    classifyPlan(
      'GRANT DELETE, INSERT, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "app_private"."x" TO "postgres";',
    ).destructive,
    false,
  );
  assert.equal(classifyPlan("TRUNCATE TABLE app_private.x;").destructive, true);
});

test("empty plan is recognized", () => {
  assert.equal(classifyPlan("  \n").empty, true);
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

test("parseArgs defaults to sync and keeps one canonical reconciliation path", () => {
  assert.deepEqual(parseArgs([]), { command: "sync", allowDestructive: false });
  assert.throws(() => parseArgs(["compat"]), /Usage/);
  assert.deepEqual(parseArgs(["prepare"]), { command: "prepare", allowDestructive: false });
  assert.deepEqual(parseArgs(["plan"]), { command: "plan", allowDestructive: false });
  assert.deepEqual(parseArgs(["sync", "--allow-destructive"]), {
    command: "sync",
    allowDestructive: true,
  });
  assert.deepEqual(parseArgs(["verify"]), { command: "verify", allowDestructive: false });
});

test("Supabase project URL yields the exact project ref", () => {
  assert.equal(
    projectRefFromSupabaseUrl("https://nmssogphayjymjpbnrxv.supabase.co"),
    "nmssogphayjymjpbnrxv",
  );
  assert.throws(() => projectRefFromSupabaseUrl("https://example.com"), /SUPABASE_URL/);
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
