import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const revision = "a".repeat(40);
const directory = new URL("../../../supabase/schemas/", import.meta.url);

async function legacyFixture() {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean);CREATE TABLE auth.identities(user_id uuid,provider text,provider_id text);",
  );
  try {
    // Stage the retained legacy projections before installing the new cross-owner guards.
    // This models the actual expand/cutover ordering; the guards are never disabled.
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (file === "910_cross_owner_constraints.sql" || file === "930_access_enforcement.sql")
        continue;
      await pg.exec(`BEGIN;${readFileSync(new URL(file, directory), "utf8")}COMMIT;`);
    }
    await pg.exec(`
      SET search_path=app_private,pg_catalog;
      INSERT INTO users(id,status,"createdAt") VALUES('legacy-owner','active',0);
      INSERT INTO account_logins(account_id,account_kind,login,updated_at)
        VALUES('legacy-owner','USER','legacy-owner',0);
      INSERT INTO repositories(id,owner_account_id,owner_account_kind,name,visibility,next_issue_number,version)
        VALUES('legacy-repository','legacy-owner','USER','Current', 'private',8,1);
      INSERT INTO repository_name_history(repository_id,old_name,renamed_at)
        VALUES('legacy-repository','Old',1);
      INSERT INTO issues(id,repository_id,number,publisher,title,body,criteria,state,workflow_status,version,created_at,updated_at)
        VALUES('legacy-issue','legacy-repository',3,'legacy-owner','Issue','','','OPEN','pending',1,1,1);
      INSERT INTO discussions(id,repository_id,author,title,body,category,version,created_at,updated_at)
        VALUES('legacy-discussion','legacy-repository','legacy-owner','Discussion','Body','General',1,1,1);
      INSERT INTO projects(id,owner_account_id,owner_account_kind,number,name,version,created_at,updated_at)
        VALUES('legacy-project','legacy-owner','USER',4,'Project',2,1,2);
      INSERT INTO project_views(id,project_id,number,name,layout,version,created_at,updated_at)
        VALUES('legacy-view','legacy-project',3,'Table','TABLE_LAYOUT',1,2,2);
      INSERT INTO project_events(project_id,version,actor,action,data,at)
        VALUES('legacy-project',2,'legacy-owner','create-view','{"viewId":"removed-view","number":9,"name":"Removed"}',2);
      INSERT INTO project_commands(actor,request_id,fingerprint,result,created_at)
        VALUES('legacy-owner','00000000-0000-4000-8000-000000000001','known-history',
          '{"projectId":"legacy-project","version":2,"action":"create-view","data":{"viewId":"removed-view","number":9,"name":"Removed"}}',2);
    `);
    return pg;
  } catch (error) {
    await pg.close();
    throw error;
  }
}

test("cutover preserves legacy locators and high-water facts, then enforces one authority", async (t) => {
  const pg = await legacyFixture();
  t.after(() => pg.close());
  await pg.transaction(async (tx) => {
    await tx.exec(readFileSync(new URL("910_cross_owner_constraints.sql", directory), "utf8"));
    await tx.exec(readFileSync(new URL("930_access_enforcement.sql", directory), "utf8"));
    await tx.query("SELECT app_private.cutover_scoped_identifiers($1,10)", [revision]);
    await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
  });

  assert.deepEqual(
    (
      await pg.query(
        "SELECT family,legacy_high_water,managed_from,next_number FROM number_series ORDER BY family",
      )
    ).rows,
    [
      { family: "account-project", legacy_high_water: 4, managed_from: 5, next_number: 5 },
      { family: "project-view", legacy_high_water: 9, managed_from: 10, next_number: 10 },
      { family: "repository-work-item", legacy_high_water: 7, managed_from: 8, next_number: 8 },
    ],
  );
  assert.deepEqual(
    (await pg.query("SELECT number,creator FROM projects WHERE id='legacy-project'")).rows,
    [{ number: 4, creator: null }],
  );
  assert.deepEqual(
    (await pg.query("SELECT number,category_id FROM discussions WHERE id='legacy-discussion'"))
      .rows,
    [{ number: null, category_id: null }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT target_id,current_name,alias FROM app_private.resolve_scoped_namespace_name('repository-name','OWNER_ACCOUNT','legacy-owner','Old')",
      )
    ).rows,
    [{ target_id: "legacy-repository", current_name: "Current", alias: true }],
  );

  assert.deepEqual(
    (await pg.query("SELECT runtime_ready,runtime_revision FROM scoped_identifier_authority")).rows,
    [{ runtime_ready: false, runtime_revision: null }],
  );
  // A deployment failure leaves the fence closed for both old and new writers.
  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog");
      await tx.exec("UPDATE repositories SET is_archived=true WHERE id='legacy-repository'");
    }),
    /scoped_identifier_writes_frozen_until_runtime_ready/,
  );
  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog");
      await tx.query("SELECT app_private.activate_scoped_identifier_runtime($1,11)", [revision]);
    }),
    /permission denied/,
  );
  await pg.query("SELECT app_private.activate_scoped_identifier_runtime($1,11)", [revision]);

  const createView = (id: string) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog");
      const allocation = await tx.query<{ number: number }>(
        "SELECT app_private.allocate_number('project-view','PROJECT','legacy-project','PROJECT_VIEW',$1,20) AS number",
        [id],
      );
      const number = allocation.rows[0]?.number;
      assert.equal(typeof number, "number");
      await tx.query(
        "SELECT app_private.claim_scoped_namespace_name('project-view','PROJECT','legacy-project','PROJECT_VIEW',$1,$2,20)",
        [id, id],
      );
      await tx.query(
        "INSERT INTO project_views(id,project_id,number,name,layout,version,created_at,updated_at) VALUES($1,'legacy-project',$2,$1,'TABLE_LAYOUT',1,20,20)",
        [id, number],
      );
      return number;
    });
  assert.equal(await createView("managed-view"), 10);
  await pg.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog");
    await tx.exec(
      "SELECT app_private.release_scoped_namespace_name('project-view','PROJECT','legacy-project','PROJECT_VIEW','managed-view','managed-view',21);DELETE FROM project_views WHERE id='managed-view'",
    );
  });
  assert.equal(await createView("next-view"), 11);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT resource_id,number FROM number_allocations WHERE family='project-view' ORDER BY number",
      )
    ).rows,
    [
      { resource_id: "legacy-view", number: 3 },
      { resource_id: "managed-view", number: 10 },
      { resource_id: "next-view", number: 11 },
    ],
  );
  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog");
      await tx.exec("UPDATE project_views SET number=99 WHERE id='next-view'");
    }),
    /resource_number_projection_mismatch/,
  );
  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog");
      await tx.exec("UPDATE project_views SET name='Bypass' WHERE id='next-view'");
    }),
    /resource_namespace_projection_mismatch/,
  );

  // The original activation snapshot remains historical as legitimate runtime facts grow.
  await pg.query("SELECT app_private.cutover_scoped_identifiers($1,30)", ["b".repeat(40)]);
  assert.deepEqual((await pg.query("SELECT revision FROM scoped_identifier_authority")).rows, [
    { revision },
  ]);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT has_function_privilege('line_app','app_private.cutover_scoped_identifiers(text,bigint)','EXECUTE') AS allowed",
      )
    ).rows,
    [{ allowed: false }],
  );
});

test("failed first cutover rolls back imported facts and activation together", async (t) => {
  const pg = await legacyFixture();
  t.after(() => pg.close());
  // A historical alias occupied by another current Repository must never pick a winner.
  await pg.exec(
    "INSERT INTO repositories(id,owner_account_id,owner_account_kind,name,visibility,version) VALUES('conflicting-repository','legacy-owner','USER','Old','private',1)",
  );
  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec(readFileSync(new URL("910_cross_owner_constraints.sql", directory), "utf8"));
      await tx.exec(readFileSync(new URL("930_access_enforcement.sql", directory), "utf8"));
      await tx.query("SELECT app_private.cutover_scoped_identifiers($1,10)", [revision]);
    }),
  );
  for (const relation of [
    "number_series",
    "number_allocations",
    "namespace_bindings",
    "namespace_claims",
    "scoped_identifier_authority",
  ]) {
    assert.deepEqual((await pg.query(`SELECT count(*)::int AS count FROM ${relation}`)).rows, [
      { count: 0 },
    ]);
  }
  assert.deepEqual(
    (await pg.query("SELECT name FROM repositories WHERE id='legacy-repository'")).rows,
    [{ name: "Current" }],
  );
});
