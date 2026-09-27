import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "smol-toml";
import { loadDataTopologySources } from "../architecture/data-topology-core.mjs";
import { localSchemaCommands } from "./schema-local.mjs";
import {
  assertSchemaOwnership,
  declaredSchemaSql,
  platformMutationViolations,
  schemaFileNames,
} from "./schema-source.mjs";

function hasTopLevelMutation(sql) {
  const withoutFunctionBodies = sql.replace(
    /create(?:\s+or\s+replace)?\s+function\b[\s\S]*?\bas\s+\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$\s*;/gi,
    "create function;",
  );
  return /^\s*(drop|insert|update|delete)\s/im.test(withoutFunctionBodies);
}

test("reserved schema files remain comment-only naming reservations", async () => {
  await loadDataTopologySources();
});

test("config and schema assembly use the same complete lexical order", () => {
  const config = parse(
    readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8"),
  );
  assert.equal(config.db.migrations.enabled, false);
  assert.deepEqual(config.db.migrations.schema_paths, ["./schemas/*.sql"]);

  const names = schemaFileNames();
  const sql = declaredSchemaSql();
  assert.deepEqual(
    [...sql.matchAll(/^-- source: (.+)$/gm)].map((match) => match[1]),
    names,
  );
  assert.equal(hasTopLevelMutation(sql), false);
  assert.doesNotMatch(sql, /^-- migration:/m);
});

test("local rebuild cannot target a linked or arbitrary database", () => {
  const commands = localSchemaCommands();
  assert.deepEqual(
    commands.map((command) => command.join(" ")),
    ["db start", "db reset --local --no-seed", "status --output json"],
  );
  assert.ok(commands[1].includes("--local"));
  for (const command of commands) {
    assert.ok(!command.some((arg) => ["--linked", "--db-url", "--project-ref"].includes(arg)));
  }
});

test("declarative schemas may depend on platform data but never mutate platform ownership", () => {
  for (const sql of [
    "select 1 from auth.users;",
    "create table app_private.example(auth_user_id uuid references auth.users(id));",
    "create function app_private.example() returns boolean language sql security definer as $$ select exists(select 1 from auth.users) $$;",
    "grant execute on function app_private.example() to line_app;",
    "revoke all on app_private.example from public, anon, authenticated, line_app;",
  ]) {
    assert.deepEqual(platformMutationViolations(sql), []);
    assert.doesNotThrow(() => assertSchemaOwnership("example.sql", sql));
  }

  for (const sql of [
    "grant usage on schema\nauth\nto line_app;",
    "grant select(id)\non auth.users\nto line_app;",
    "revoke execute on function public.rls_auto_enable() from public;",
    "alter table\nstorage.objects\nenable row level security;",
    "create policy example\non auth.users\nusing (true);",
    "create unique index example\non storage.objects(id);",
    "alter default privileges in schema auth grant select on tables to line_app;",
    "create function app_private.bad() returns void language plpgsql as $$ begin insert into auth.users(id) values(null); end $$;",
    "create function app_private.bad() returns void language plpgsql as $$ begin update storage.objects set id=id; end $$;",
    "delete from supabase_migrations.schema_migrations;",
    "truncate public.example;",
    "comment on table auth.users is 'owned elsewhere';",
    "create extension pgcrypto;",
    "create role platform_shadow;",
  ]) {
    assert.notDeepEqual(platformMutationViolations(sql), []);
    assert.throws(() => assertSchemaOwnership("example.sql", sql), /must not mutate/);
  }
});

test("declarative schemas may define function behavior but not top-level mutation", () => {
  assert.equal(
    hasTopLevelMutation(`
      create or replace function app_private.example()
      returns void
      language plpgsql
      as $function$
      begin
        insert into app_private.example_table(id) values (1);
      end
      $function$;
    `),
    false,
  );
  for (const sql of [
    "drop table app_private.example_table;",
    "insert into app_private.example_table(id) values (1);",
    "update app_private.example_table set id=2 where id=1;",
    "delete from app_private.example_table where id=1;",
  ])
    assert.equal(hasTopLevelMutation(sql), true);
});
