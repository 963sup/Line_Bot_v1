import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConfirmedProject,
  assertMigrationHistoryUnchanged,
  assertRemoteMutationContext,
  assertRemoteTarget,
  assertSupabaseRecoveryReadback,
  assertSupabaseRestReadback,
  assertTransactionalPlan,
  classifyPlan,
  classifyRemoteFoundationState,
  parseArgs,
  planFingerprint,
  projectRefFromSupabaseUrl,
  runWithRemoteReconciliationLock,
  supabaseApiReadbackConfig,
  supabaseManagementRecoveryConfig,
  verifySupabaseApiReadback,
  verifySupabaseRecoveryReadback,
} from "./remote.mjs";

test("remote reconciliation lock preserves the root failure after an aborted transaction", async () => {
  const queries = [];
  let recovered = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql === "ROLLBACK") {
        recovered = true;
        return { rows: [] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        if (!recovered) throw Object.assign(new Error("transaction aborted"), { code: "25P02" });
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const rootError = new Error("original schema failure");

  await assert.rejects(
    runWithRemoteReconciliationLock(client, async () => {
      throw rootError;
    }),
    (error) => error === rootError,
  );
  assert.equal(
    queries.some((sql) => sql === "ROLLBACK"),
    true,
  );
  assert.equal(queries.at(-1).includes("pg_advisory_unlock"), true);
});

test("remote reconciliation lock surfaces cleanup failure when work succeeded", async () => {
  const client = {
    async query(sql) {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.includes("pg_advisory_unlock")) throw new Error("unlock failed");
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  await assert.rejects(
    runWithRemoteReconciliationLock(client, async () => "ok"),
    /unlock failed/,
  );
});

test("classifyPlan marks routine DDL for diagnostics", () => {
  for (const sql of [
    "create table app_private.example(id bigint);",
    "alter table app_private.example add column note text;",
    "alter table app_private.example add constraint example_id_check check (id > 0);",
    'grant select on table "app_private"."x" to "postgres";',
    "revoke all on table app_private.x from public, anon, authenticated;",
    "create or replace function app_private.example() returns void language sql as $$ select null $$;",
  ]) {
    assert.equal(classifyPlan(sql).mode, "routine", sql);
  }
});

test("classifyPlan marks destructive, security-sensitive and unknown DDL as sensitive diagnostics", () => {
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
    assert.equal(classifyPlan(sql).mode, "sensitive", sql);
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
    mode: "routine",
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

test("atomic reconciliation refuses transaction escapes and nontransactional diff units", () => {
  for (const sql of [
    "CREATE TABLE app_private.x(id bigint); COMMIT; DROP TABLE app_private.x;",
    "END;",
    "START TRANSACTION;",
    "CREATE INDEX CONCURRENTLY x ON app_private.x(id);",
    "DROP INDEX CONCURRENTLY app_private.x;",
    "REINDEX INDEX CONCURRENTLY app_private.x;",
    "VACUUM app_private.x;",
  ])
    assert.throws(() => assertTransactionalPlan(sql), /atomic reconciliation transaction/);
  assert.doesNotThrow(() =>
    assertTransactionalPlan(`
    SET LOCAL lock_timeout = '5s';
    CREATE TABLE app_private.x(id bigint);
    CREATE FUNCTION app_private.example() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN RAISE NOTICE 'COMMIT'; END;
    $$;
  `),
  );
});

test("plan fingerprint binds diagnostic evidence to exact SQL", () => {
  const sql = "drop table app_private.example;";
  assert.match(planFingerprint(sql), /^[0-9a-f]{64}$/);
  assert.notEqual(planFingerprint(sql), planFingerprint(sql + "\n"));
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

test("remote command surface only exposes sync and explicit read-only diagnostics", () => {
  assert.deepEqual(parseArgs([]), { command: "sync", api: false });
  for (const command of ["sync", "plan", "verify", "recovery"]) {
    assert.deepEqual(parseArgs([command]), { command, api: false });
  }
  for (const command of ["repair", "prepare", "compat"])
    assert.throws(() => parseArgs([command]), /Usage/);
  for (const flag of ["--reviewed-plan", "--allow-manual", "--allow-destructive"]) {
    assert.throws(() => parseArgs(["sync", flag]), /Usage/);
  }
  assert.deepEqual(parseArgs(["verify", "--api"]), { command: "verify", api: true });
  assert.throws(() => parseArgs(["sync", "--api"]), /only valid/);
  assert.throws(() => parseArgs(["verify", "--unknown"]), /Usage/);
});

test("remote mutations require the validated-main GitHub Actions context", () => {
  for (const command of ["sync"]) {
    assert.throws(
      () => assertRemoteMutationContext(command, {}),
      /GitHub Actions current-main reconciliation path/,
    );
    assert.throws(
      () => assertRemoteMutationContext(command, { GITHUB_ACTIONS: "true" }),
      /GitHub Actions current-main reconciliation path/,
    );
    assert.doesNotThrow(() =>
      assertRemoteMutationContext(command, {
        GITHUB_ACTIONS: "true",
        SUPABASE_REMOTE_MUTATION_CONTEXT: "validated-main",
      }),
    );
  }
  for (const command of ["plan", "verify", "recovery"]) {
    assert.doesNotThrow(() => assertRemoteMutationContext(command, {}));
  }
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

test("Supabase recovery config binds Management API access to the confirmed project", () => {
  assert.deepEqual(
    supabaseManagementRecoveryConfig({
      SUPABASE_URL: "https://nmssogphayjymjpbnrxv.supabase.co",
      SUPABASE_CONFIRM_PROJECT: "nmssogphayjymjpbnrxv",
      SUPABASE_ACCESS_TOKEN: "management-token",
    }),
    {
      projectRef: "nmssogphayjymjpbnrxv",
      accessToken: "management-token",
    },
  );
  assert.throws(
    () =>
      supabaseManagementRecoveryConfig({
        SUPABASE_URL: "https://nmssogphayjymjpbnrxv.supabase.co",
        SUPABASE_CONFIRM_PROJECT: "nmssogphayjymjpbnrxv",
      }),
    /SUPABASE_ACCESS_TOKEN/,
  );
  assert.throws(
    () =>
      supabaseManagementRecoveryConfig({
        SUPABASE_URL: "https://nmssogphayjymjpbnrxv.supabase.co",
        SUPABASE_CONFIRM_PROJECT: "other",
        SUPABASE_ACCESS_TOKEN: "management-token",
      }),
    /exactly match/,
  );
});

test("Supabase recovery readback accepts PITR/WALG or a completed managed backup", () => {
  assert.deepEqual(
    assertSupabaseRecoveryReadback({
      pitr_enabled: true,
      walg_enabled: true,
      backups: [],
    }),
    {
      provider: "supabase",
      pitrEnabled: true,
      walgEnabled: true,
      completedBackupCount: 0,
      latestCompletedBackupAt: null,
      latestCompletedBackupPhysical: null,
    },
  );

  assert.deepEqual(
    assertSupabaseRecoveryReadback({
      pitr_enabled: false,
      walg_enabled: false,
      backups: [
        {
          status: "COMPLETED",
          inserted_at: "2026-09-25T12:00:00Z",
          is_physical_backup: true,
        },
        {
          status: "FAILED",
          inserted_at: "2026-09-26T12:00:00Z",
          is_physical_backup: true,
        },
      ],
    }),
    {
      provider: "supabase",
      pitrEnabled: false,
      walgEnabled: false,
      completedBackupCount: 1,
      latestCompletedBackupAt: "2026-09-25T12:00:00Z",
      latestCompletedBackupPhysical: true,
    },
  );

  assert.throws(
    () =>
      assertSupabaseRecoveryReadback({
        pitr_enabled: false,
        walg_enabled: false,
        backups: [],
      }),
    /recovery is unavailable/i,
  );
  assert.throws(() => assertSupabaseRecoveryReadback({}), /unexpected response/i);
});

test("Supabase recovery readback calls the exact Management API target without leaking token", async () => {
  const calls = [];
  const result = await verifySupabaseRecoveryReadback(
    { projectRef: "nmssogphayjymjpbnrxv", accessToken: "management-token" },
    async (url, options) => {
      calls.push({
        url,
        authorization: options.headers.Authorization,
        hasSignal: Boolean(options.signal),
      });
      return Response.json({
        pitr_enabled: false,
        walg_enabled: false,
        backups: [
          {
            status: "COMPLETED",
            inserted_at: "2026-09-25T12:00:00Z",
            is_physical_backup: false,
          },
        ],
      });
    },
  );

  assert.deepEqual(calls, [
    {
      url: "https://api.supabase.com/v1/projects/nmssogphayjymjpbnrxv/database/backups",
      authorization: "Bearer management-token",
      hasSignal: true,
    },
  ]);
  assert.equal(result.projectRef, "nmssogphayjymjpbnrxv");
  assert.equal(result.completedBackupCount, 1);
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
