import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { postgresFixture } from "../src/testing/postgres.js";
import { booleanValue, numberValue, record, stringValue } from "../src/validation.js";

test("declarative schemas clean-build from current sources", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const result = await pg.query(
    "select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relkind in ('r','v')",
  );
  const [value] = result.rows;
  const row = record(value);
  assert.ok(row);
  assert.ok(numberValue(row.count) > 0);
});

test("existing-target reconciliation can reapply the neutral foundation without changing runtime authority", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const foundation = readFileSync(
    new URL("../../../supabase/schemas/000_foundation.sql", import.meta.url),
    "utf8",
  );
  const contract = () =>
    pg.query(`
    SELECT p.oid,p.prosecdef,p.proconfig,r.rolname AS owner,
      has_function_privilege('line_app',p.oid,'EXECUTE') AS runtime_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid=to_regprocedure('app_private.lock_governance(text)')`);
  const before = (await contract()).rows;
  assert.equal(before.length, 1);
  const authority = record(before[0]);
  assert.equal(authority.prosecdef, false);
  assert.notEqual(authority.owner, "line_app");
  assert.equal(authority.runtime_execute, true);
  assert.equal(authority.anon_execute, false);
  assert.equal(authority.authenticated_execute, false);
  await pg.exec(`BEGIN;\n${foundation}\nCOMMIT;`);
  await pg.exec(`BEGIN;\n${foundation}\nCOMMIT;`);
  assert.deepEqual((await contract()).rows, before);
  for (const mode of ["shared", "exclusive"])
    await db.transaction((sql) => sql.query("SELECT app_private.lock_governance($1)", [mode]));
  await assert.rejects(
    db.transaction((sql) => sql.query("SELECT app_private.lock_governance('invalid')")),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "22023",
  );
});

test("runtime role cannot login, bypass RLS, or become superuser", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const result = await pg.query(
    "select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname='line_app'",
  );
  assert.deepEqual(result.rows, [{ rolcanlogin: false, rolbypassrls: false, rolsuper: false }]);
});

test("governance runtime relations keep row-level security enabled", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const expected = [
    "enterprise_direct_affiliations",
    "enterprise_role_assignments",
    "enterprises",
    "organization_memberships",
    "organization_role_assignments",
    "organizations",
  ];
  const result = await pg.query(
    "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname = any($1::text[]) order by c.relname",
    [expected],
  );
  assert.deepEqual(
    result.rows,
    expected.map((relname) => ({ relname, relrowsecurity: true })),
  );
});

test("runtime role has no direct Supabase Auth privileges", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const result = await pg.query(
    "select has_schema_privilege('line_app','auth','USAGE') as auth_usage, has_column_privilege('line_app','auth.users','id','SELECT') as auth_user_id_select, has_column_privilege('line_app','auth.identities','provider_id','SELECT') as auth_identity_select",
  );
  assert.deepEqual(result.rows, [
    { auth_usage: false, auth_user_id_select: false, auth_identity_select: false },
  ]);
});

test("Auth dependencies stay constrained behind FK and SECURITY DEFINER boundaries", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const fk = await pg.query(
    "select count(*)::int as count from pg_constraint where conname='users_auth_user_id_fkey' and conrelid='app_private.users'::regclass and confrelid='auth.users'::regclass",
  );
  assert.equal(numberValue(record(fk.rows[0]).count), 1);

  const fn = await pg.query(
    "select p.prosecdef, r.rolname as owner from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure('app_private.attendance_account_active(uuid,bigint)')",
  );
  assert.equal(fn.rows.length, 1);
  assert.equal(booleanValue(record(fn.rows[0]).prosecdef), true);
  assert.notEqual(stringValue(record(fn.rows[0]).owner), "line_app");
});

test("runtime provisioning creates governance roots only through narrow coordinators", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  await pg.transaction(async (sql) => {
    await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "creator",
      "active",
      1,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "creator",
      "creator",
      1,
    ]);
  });

  const privileges = await pg.query(
    "select has_function_privilege('line_app','app_private.provision_enterprise_scope(text,text,text,text,bigint)','EXECUTE') as enterprise_create, has_function_privilege('line_app','app_private.provision_organization_scope(text,text,text,text,bigint)','EXECUTE') as organization_create, has_function_privilege('line_app','app_private.bootstrap_enterprise(text,text,text,text,text,text,text,uuid,bigint)','EXECUTE') as enterprise_bootstrap",
  );
  assert.deepEqual(privileges.rows, [
    { enterprise_create: true, organization_create: true, enterprise_bootstrap: false },
  ]);

  await pg.query("set role line_app");
  try {
    await pg.query("select * from app_private.provision_enterprise_scope($1,$2,$3,$4,$5)", [
      "enterprise-self-service",
      "creator",
      "enterprise-self-service",
      "Enterprise Self Service",
      2,
    ]);
    await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
      "organization-self-service",
      "creator",
      "organization-self-service",
      "Organization Self Service",
      3,
    ]);
  } finally {
    await pg.query("reset role");
  }

  const roots = await pg.query(
    "select id,kind from app_private.accounts where id in ('enterprise-self-service','organization-self-service') order by id",
  );
  assert.deepEqual(roots.rows, [
    { id: "enterprise-self-service", kind: "ENTERPRISE" },
    { id: "organization-self-service", kind: "ORGANIZATION" },
  ]);
  const enterpriseLocator = await pg.query(
    "select slug from app_private.enterprises where account_id='enterprise-self-service'",
  );
  assert.deepEqual(enterpriseLocator.rows, [{ slug: "enterprise-self-service" }]);
  const organizationLocator = await pg.query(
    "select login from app_private.account_logins where account_id='organization-self-service' and account_kind='ORGANIZATION'",
  );
  assert.deepEqual(organizationLocator.rows, [{ login: "organization-self-service" }]);
  const enterpriseOwner = await pg.query(
    "select status from app_private.enterprise_role_assignments where enterprise_account_id='enterprise-self-service' and user_id='creator' and role='EnterpriseOwner'",
  );
  assert.deepEqual(enterpriseOwner.rows, [{ status: "active" }]);
  const organizationOwner = await pg.query(
    "select status,membership_version from app_private.organization_role_assignments where organization_account_id='organization-self-service' and user_id='creator' and role='OrganizationOwner'",
  );
  assert.deepEqual(organizationOwner.rows, [{ status: "active", membership_version: 1 }]);
});

test("Project runtime privileges match activated planning capabilities", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const expected = [
    "project_commands",
    "project_draft_issue_assignees",
    "project_draft_issues",
    "project_events",
    "project_field_iterations",
    "project_field_options",
    "project_fields",
    "project_item_field_values",
    "project_item_multi_select_values",
    "project_items",
    "project_milestones",
    "project_action_attempts",
    "project_action_commands",
    "project_action_events",
    "project_action_rule_versions",
    "project_action_rules",
    "project_action_runs",
    "project_repository_references",
    "project_status_updates",
    "project_team_access",
    "project_user_access",
    "project_view_visible_fields",
    "project_views",
    "project_wbs",
    "project_wbs_baselines",
    "project_wbs_commands",
    "project_wbs_governance",
    "project_wbs_governance_commands",
    "project_wbs_outbox",
    "project_wbs_policies",
    "project_wbs_proposal_versions",
    "project_wbs_proposals",
    "project_wbs_reviews",
    "project_wbs_revisions",
    "projects",
  ];
  const result = await pg.query(
    `select c.relname,
      c.relrowsecurity,
      has_table_privilege('line_app', c.oid, 'SELECT') as can_select,
      has_table_privilege('line_app', c.oid, 'INSERT') as can_insert,
      has_table_privilege('line_app', c.oid, 'UPDATE') as can_update,
      has_table_privilege('line_app', c.oid, 'DELETE') as can_delete
     from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private' and c.relname=any($1::text[])
     order by c.relname`,
    [expected],
  );

  const all = {
    relrowsecurity: true,
    can_select: true,
    can_insert: true,
    can_update: true,
    can_delete: true,
  };
  const readInsert = {
    relrowsecurity: true,
    can_select: true,
    can_insert: true,
    can_update: false,
    can_delete: false,
  };
  const relationSet = {
    relrowsecurity: true,
    can_select: true,
    can_insert: true,
    can_update: false,
    can_delete: true,
  };
  const readInsertUpdate = {
    relrowsecurity: true,
    can_select: true,
    can_insert: true,
    can_update: true,
    can_delete: false,
  };
  const none = {
    relrowsecurity: true,
    can_select: false,
    can_insert: false,
    can_update: false,
    can_delete: false,
  };

  assert.deepEqual(result.rows, [
    { relname: "project_action_attempts", ...readInsertUpdate },
    { relname: "project_action_commands", ...readInsert },
    { relname: "project_action_events", ...readInsert },
    { relname: "project_action_rule_versions", ...readInsert },
    { relname: "project_action_rules", ...readInsertUpdate },
    { relname: "project_action_runs", ...readInsertUpdate },
    { relname: "project_commands", ...readInsert },
    { relname: "project_draft_issue_assignees", ...relationSet },
    { relname: "project_draft_issues", ...readInsertUpdate },
    { relname: "project_events", ...readInsert },
    { relname: "project_field_iterations", ...all },
    { relname: "project_field_options", ...all },
    { relname: "project_fields", ...all },
    { relname: "project_item_field_values", ...all },
    { relname: "project_item_multi_select_values", ...relationSet },
    { relname: "project_items", ...all },
    { relname: "project_milestones", ...none },
    { relname: "project_repository_references", ...all },
    { relname: "project_status_updates", ...readInsertUpdate },
    { relname: "project_team_access", ...all },
    { relname: "project_user_access", ...all },
    { relname: "project_view_visible_fields", ...all },
    { relname: "project_views", ...all },
    { relname: "project_wbs", ...readInsertUpdate },
    { relname: "project_wbs_baselines", ...readInsert },
    { relname: "project_wbs_commands", ...readInsert },
    { relname: "project_wbs_governance", ...readInsertUpdate },
    { relname: "project_wbs_governance_commands", ...readInsert },
    { relname: "project_wbs_outbox", ...readInsert },
    { relname: "project_wbs_policies", ...readInsert },
    { relname: "project_wbs_proposal_versions", ...readInsert },
    { relname: "project_wbs_proposals", ...readInsertUpdate },
    { relname: "project_wbs_reviews", ...readInsert },
    { relname: "project_wbs_revisions", ...readInsert },
    {
      relname: "projects",
      relrowsecurity: true,
      can_select: true,
      can_insert: false,
      can_update: false,
      can_delete: false,
    },
  ]);

  const projectColumns = await pg.query(
    `select
      has_column_privilege('line_app','app_private.projects','id','INSERT') as can_insert_id,
      has_column_privilege('line_app','app_private.projects','owner_account_id','INSERT') as can_insert_owner,
      has_column_privilege('line_app','app_private.projects','number','INSERT') as can_insert_number,
      has_column_privilege('line_app','app_private.projects','number','UPDATE') as can_update_number,
      has_column_privilege('line_app','app_private.projects','name','UPDATE') as can_update_name,
      has_column_privilege('line_app','app_private.projects','is_public','UPDATE') as can_update_public,
      has_column_privilege('line_app','app_private.projects','creator','UPDATE') as can_update_creator,
      has_column_privilege('line_app','app_private.projects','owner_account_id','UPDATE') as can_update_owner,
      has_column_privilege('line_app','app_private.projects','deleted_at','UPDATE') as can_update_deleted`,
  );
  assert.deepEqual(projectColumns.rows, [
    {
      can_insert_id: true,
      can_insert_owner: true,
      can_insert_number: true,
      can_update_number: true,
      can_update_name: true,
      can_update_public: true,
      can_update_creator: false,
      can_update_owner: false,
      can_update_deleted: true,
    },
  ]);
});

test("Project WBS and automation schema preserve scoped version and immutable evidence contracts", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const columns = await pg.query(
    `select table_name,array_agg(column_name order by ordinal_position) as columns
     from information_schema.columns
     where table_schema='app_private' and table_name=any($1::text[])
     group by table_name order by table_name`,
    [
      [
        "project_action_attempts",
        "project_action_commands",
        "project_action_events",
        "project_action_rule_versions",
        "project_action_rules",
        "project_action_runs",
        "project_wbs",
        "project_wbs_baselines",
        "project_wbs_commands",
        "project_wbs_governance",
        "project_wbs_governance_commands",
        "project_wbs_outbox",
        "project_wbs_policies",
        "project_wbs_proposal_versions",
        "project_wbs_proposals",
        "project_wbs_reviews",
        "project_wbs_revisions",
      ],
    ],
  );
  assert.deepEqual(columns.rows, [
    {
      table_name: "project_action_attempts",
      columns: ["run_id", "number", "lease_token", "started_at", "finished_at", "result"],
    },
    {
      table_name: "project_action_commands",
      columns: ["actor", "request_id", "fingerprint", "result", "at"],
    },
    { table_name: "project_action_events", columns: ["id", "project_id", "at"] },
    {
      table_name: "project_action_rule_versions",
      columns: ["rule_id", "version", "snapshot"],
    },
    { table_name: "project_action_rules", columns: ["id", "project_id", "version"] },
    {
      table_name: "project_action_runs",
      columns: [
        "id",
        "project_id",
        "rule_id",
        "rule_version",
        "rule_snapshot",
        "revision_id",
        "baseline_id",
        "source_event_id",
        "status",
        "version",
        "step",
        "attempt",
        "available_at",
        "created_at",
        "results",
        "lease_token",
        "lease_until",
      ],
    },
    { table_name: "project_wbs", columns: ["project_id", "version", "head_revision_id"] },
    {
      table_name: "project_wbs_baselines",
      columns: [
        "id",
        "project_id",
        "number",
        "proposal_id",
        "proposal_version",
        "revision_id",
        "previous_baseline_id",
        "policy_version",
        "published_by",
        "approval_review_ids",
        "at",
      ],
    },
    {
      table_name: "project_wbs_commands",
      columns: ["actor_user_id", "request_id", "project_id", "fingerprint", "revision_id"],
    },
    {
      table_name: "project_wbs_governance",
      columns: ["project_id", "version", "policy_version", "published_baseline_id"],
    },
    {
      table_name: "project_wbs_governance_commands",
      columns: ["actor_user_id", "request_id", "project_id", "fingerprint", "result"],
    },
    {
      table_name: "project_wbs_outbox",
      columns: [
        "id",
        "event_no",
        "project_id",
        "baseline_id",
        "revision_id",
        "at",
        "lease_token",
        "lease_until",
        "acknowledged_at",
      ],
    },
    {
      table_name: "project_wbs_policies",
      columns: [
        "project_id",
        "version",
        "minimum_approvals",
        "allow_self_approval",
        "actor_user_id",
        "at",
      ],
    },
    {
      table_name: "project_wbs_proposal_versions",
      columns: [
        "project_id",
        "proposal_id",
        "version",
        "title",
        "reason",
        "status",
        "candidate_revision_id",
        "base_baseline_id",
        "actor_user_id",
        "at",
      ],
    },
    {
      table_name: "project_wbs_proposals",
      columns: ["id", "project_id", "number", "version", "author_user_id", "created_at"],
    },
    {
      table_name: "project_wbs_reviews",
      columns: [
        "id",
        "project_id",
        "proposal_id",
        "proposal_version",
        "candidate_revision_id",
        "policy_version",
        "reviewer_user_id",
        "decision",
        "note",
        "sequence",
        "at",
      ],
    },
    {
      table_name: "project_wbs_revisions",
      columns: [
        "id",
        "project_id",
        "version",
        "parent_revision_id",
        "actor_user_id",
        "action",
        "contract_import",
        "document",
        "at",
      ],
    },
  ]);

  const foreignKey = async (
    table: string,
    sourceColumns: string[],
    target: string,
    targetColumns: string[],
  ) => {
    const result = await pg.query(
      `select c.condeferrable,c.condeferred
       from pg_constraint c
       where c.contype='f' and c.conrelid=$1::regclass and c.confrelid=$2::regclass
         and (select array_agg(a.attname::text order by u.ordinality)
              from unnest(c.conkey) with ordinality u(attnum,ordinality)
              join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)=$3::text[]
         and (select array_agg(a.attname::text order by u.ordinality)
              from unnest(c.confkey) with ordinality u(attnum,ordinality)
              join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.attnum)=$4::text[]`,
      [`app_private.${table}`, `app_private.${target}`, sourceColumns, targetColumns],
    );
    assert.deepEqual(result.rows, [{ condeferrable: false, condeferred: false }]);
  };
  await foreignKey(
    "project_wbs_revisions",
    ["project_id", "parent_revision_id"],
    "project_wbs_revisions",
    ["project_id", "id"],
  );
  await foreignKey("project_wbs_commands", ["project_id", "revision_id"], "project_wbs_revisions", [
    "project_id",
    "id",
  ]);
  await foreignKey(
    "project_wbs_reviews",
    ["project_id", "proposal_id", "proposal_version", "candidate_revision_id"],
    "project_wbs_proposal_versions",
    ["project_id", "proposal_id", "version", "candidate_revision_id"],
  );
  await foreignKey(
    "project_wbs_baselines",
    ["project_id", "proposal_id", "proposal_version", "revision_id"],
    "project_wbs_proposal_versions",
    ["project_id", "proposal_id", "version", "candidate_revision_id"],
  );
  await foreignKey("project_wbs_outbox", ["project_id", "baseline_id"], "project_wbs_baselines", [
    "project_id",
    "id",
  ]);
  await foreignKey("project_wbs_outbox", ["project_id", "revision_id"], "project_wbs_revisions", [
    "project_id",
    "id",
  ]);
  await foreignKey("project_action_runs", ["project_id", "rule_id"], "project_action_rules", [
    "project_id",
    "id",
  ]);
  await foreignKey("project_action_runs", ["project_id", "revision_id"], "project_wbs_revisions", [
    "project_id",
    "id",
  ]);
  await foreignKey("project_action_runs", ["project_id", "baseline_id"], "project_wbs_baselines", [
    "project_id",
    "id",
  ]);

  const deferredHeads = await pg.query(
    `select conname,condeferrable,condeferred
     from pg_constraint
     where conname=any(array['project_wbs_head_fkey','project_wbs_proposal_head_fkey'])
     order by conname`,
  );
  assert.deepEqual(deferredHeads.rows, [
    { conname: "project_wbs_head_fkey", condeferrable: true, condeferred: true },
    { conname: "project_wbs_proposal_head_fkey", condeferrable: true, condeferred: true },
  ]);

  const immutable = [
    "project_action_commands",
    "project_action_events",
    "project_action_rule_versions",
    "project_wbs_baselines",
    "project_wbs_commands",
    "project_wbs_governance_commands",
    "project_wbs_policies",
    "project_wbs_proposal_versions",
    "project_wbs_reviews",
    "project_wbs_revisions",
  ];
  const immutablePrivileges = await pg.query(
    `select c.relname,
      has_table_privilege('line_app',c.oid,'UPDATE') as can_update,
      has_table_privilege('line_app',c.oid,'DELETE') as can_delete
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private' and c.relname=any($1::text[])
     order by c.relname`,
    [immutable],
  );
  assert.deepEqual(
    immutablePrivileges.rows,
    immutable.map((relname) => ({ relname, can_update: false, can_delete: false })),
  );

  const outboxColumns = await pg.query(
    `select column_name,has_column_privilege(
       'line_app',format('app_private.%I',table_name),column_name,'UPDATE'
     ) as can_update
     from information_schema.columns
     where table_schema='app_private' and table_name='project_wbs_outbox'
     order by ordinal_position`,
  );
  assert.deepEqual(
    outboxColumns.rows,
    [
      "id",
      "event_no",
      "project_id",
      "baseline_id",
      "revision_id",
      "at",
      "lease_token",
      "lease_until",
      "acknowledged_at",
    ].map((column_name) => ({
      column_name,
      can_update: ["lease_token", "lease_until", "acknowledged_at"].includes(column_name),
    })),
  );
});

test("WBS scope transfer exposes only request intent and immutable cutover evidence", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const columns = await pg.query(
    `select table_name,array_agg(column_name order by ordinal_position) as columns
     from information_schema.columns
     where table_schema='app_private'
       and table_name=any(array['legacy_wbs_command_evidence','wbs_scope_transfers'])
     group by table_name order by table_name`,
  );
  assert.deepEqual(columns.rows, [
    {
      table_name: "legacy_wbs_command_evidence",
      columns: [
        "actor_user_id",
        "request_id",
        "repository_id",
        "fingerprint",
        "revision_id",
        "project_id",
        "transfer_id",
      ],
    },
    {
      table_name: "wbs_scope_transfers",
      columns: [
        "id",
        "repository_id",
        "project_id",
        "actor_user_id",
        "request_id",
        "state",
        "source_version",
        "source_head_revision_id",
        "revision_count",
        "command_count",
        "source_hash",
        "requested_at",
        "activated_at",
        "release_sha",
        "cancelled_at",
        "cancel_request_id",
      ],
    },
  ]);

  const privileges = await pg.query(
    `select c.relname,c.relrowsecurity,
      has_table_privilege('line_app',c.oid,'SELECT') as can_select,
      has_table_privilege('line_app',c.oid,'INSERT') as can_insert,
      has_table_privilege('line_app',c.oid,'UPDATE') as can_update,
      has_table_privilege('line_app',c.oid,'DELETE') as can_delete
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private'
       and c.relname=any(array['legacy_wbs_command_evidence','wbs_scope_transfers'])
     order by c.relname`,
  );
  assert.deepEqual(privileges.rows, [
    {
      relname: "legacy_wbs_command_evidence",
      relrowsecurity: true,
      can_select: true,
      can_insert: false,
      can_update: false,
      can_delete: false,
    },
    {
      relname: "wbs_scope_transfers",
      relrowsecurity: true,
      can_select: true,
      can_insert: false,
      can_update: false,
      can_delete: false,
    },
  ]);

  const transferInsertColumns = await pg.query(
    `select column_name,has_column_privilege(
       'line_app','app_private.wbs_scope_transfers',column_name,'INSERT'
     ) as can_insert
     from information_schema.columns
     where table_schema='app_private' and table_name='wbs_scope_transfers'
     order by ordinal_position`,
  );
  const requestColumns = new Set([
    "id",
    "repository_id",
    "project_id",
    "actor_user_id",
    "request_id",
    "source_version",
    "source_head_revision_id",
    "revision_count",
    "command_count",
    "source_hash",
    "requested_at",
  ]);
  assert.deepEqual(
    transferInsertColumns.rows,
    [
      "id",
      "repository_id",
      "project_id",
      "actor_user_id",
      "request_id",
      "state",
      "source_version",
      "source_head_revision_id",
      "revision_count",
      "command_count",
      "source_hash",
      "requested_at",
      "activated_at",
      "release_sha",
      "cancelled_at",
      "cancel_request_id",
    ].map((column_name) => ({ column_name, can_insert: requestColumns.has(column_name) })),
  );

  const transferUpdateColumns = await pg.query(
    `select column_name,has_column_privilege(
       'line_app','app_private.wbs_scope_transfers',column_name,'UPDATE'
     ) as can_update
     from information_schema.columns
     where table_schema='app_private' and table_name='wbs_scope_transfers'
     order by ordinal_position`,
  );
  const cancellationColumns = new Set(["state", "cancelled_at", "cancel_request_id"]);
  assert.deepEqual(
    transferUpdateColumns.rows,
    [
      "id",
      "repository_id",
      "project_id",
      "actor_user_id",
      "request_id",
      "state",
      "source_version",
      "source_head_revision_id",
      "revision_count",
      "command_count",
      "source_hash",
      "requested_at",
      "activated_at",
      "release_sha",
      "cancelled_at",
      "cancel_request_id",
    ].map((column_name) => ({ column_name, can_update: cancellationColumns.has(column_name) })),
  );

  const liveReservations = await pg.query(
    `select c.relname as index_name,i.indisunique,pg_get_expr(i.indpred,i.indrelid) as predicate
     from pg_index i join pg_class c on c.oid=i.indexrelid
     where i.indrelid='app_private.wbs_scope_transfers'::regclass
       and c.relname=any(array[
         'wbs_scope_transfers_live_project',
         'wbs_scope_transfers_live_repository'
       ]) order by c.relname`,
  );
  assert.deepEqual(
    liveReservations.rows.map((row) => ({
      index_name: stringValue(record(row).index_name),
      indisunique: booleanValue(record(row).indisunique),
      liveOnly: /REQUESTED.*ACTIVE/.test(stringValue(record(row).predicate)),
    })),
    [
      {
        index_name: "wbs_scope_transfers_live_project",
        indisunique: true,
        liveOnly: true,
      },
      {
        index_name: "wbs_scope_transfers_live_repository",
        indisunique: true,
        liveOnly: true,
      },
    ],
  );

  const transferSource = await pg.query(
    `select c.condeferrable,c.condeferred
     from pg_constraint c
     where c.contype='f'
       and c.conrelid='app_private.wbs_scope_transfers'::regclass
       and c.confrelid='app_private.repository_wbs_revisions'::regclass
       and (select array_agg(a.attname::text order by u.ordinality)
            from unnest(c.conkey) with ordinality u(attnum,ordinality)
            join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)
         =array['repository_id','source_version','source_head_revision_id']
       and (select array_agg(a.attname::text order by u.ordinality)
            from unnest(c.confkey) with ordinality u(attnum,ordinality)
            join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.attnum)
         =array['repository_id','version','id']`,
  );
  assert.deepEqual(transferSource.rows, [{ condeferrable: false, condeferred: false }]);

  const evidenceRevision = await pg.query(
    `select count(*)::int as count
     from pg_constraint c
     where c.contype='f'
       and c.conrelid='app_private.legacy_wbs_command_evidence'::regclass
       and c.confrelid='app_private.project_wbs_revisions'::regclass
       and (select array_agg(a.attname::text order by u.ordinality)
            from unnest(c.conkey) with ordinality u(attnum,ordinality)
            join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)
         =array['project_id','revision_id']
       and (select array_agg(a.attname::text order by u.ordinality)
            from unnest(c.confkey) with ordinality u(attnum,ordinality)
            join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.attnum)
         =array['project_id','id']`,
  );
  assert.deepEqual(evidenceRevision.rows, [{ count: 1 }]);

  const evidenceTransfer = await pg.query(
    `select count(*)::int as count
     from pg_constraint c
     where c.contype='f'
       and c.conrelid='app_private.legacy_wbs_command_evidence'::regclass
       and c.confrelid='app_private.wbs_scope_transfers'::regclass
       and (select array_agg(a.attname::text order by u.ordinality)
            from unnest(c.conkey) with ordinality u(attnum,ordinality)
            join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)
         =array['transfer_id','repository_id','project_id']
       and (select array_agg(a.attname::text order by u.ordinality)
            from unnest(c.confkey) with ordinality u(attnum,ordinality)
            join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.attnum)
         =array['id','repository_id','project_id']`,
  );
  assert.deepEqual(evidenceTransfer.rows, [{ count: 1 }]);

  const functionPrivileges = await pg.query(
    `select p.proname,
      has_function_privilege('line_app',p.oid,'EXECUTE') as runtime_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='app_private' and p.proname=any(array[
       'reject_legacy_wbs_evidence_mutation',
       'enforce_wbs_scope_transfer_cancel',
       'wbs_scope_transfer_blocks_project',
       'wbs_scope_transfer_blocks_repository'
     ]) order by p.proname`,
  );
  assert.deepEqual(functionPrivileges.rows, [
    {
      proname: "enforce_wbs_scope_transfer_cancel",
      runtime_execute: true,
      anon_execute: false,
      authenticated_execute: false,
    },
    {
      proname: "reject_legacy_wbs_evidence_mutation",
      runtime_execute: false,
      anon_execute: false,
      authenticated_execute: false,
    },
    {
      proname: "wbs_scope_transfer_blocks_project",
      runtime_execute: true,
      anon_execute: false,
      authenticated_execute: false,
    },
    {
      proname: "wbs_scope_transfer_blocks_repository",
      runtime_execute: true,
      anon_execute: false,
      authenticated_execute: false,
    },
  ]);

  const fences = await pg.query(
    `select tgname
     from pg_trigger
     where not tgisinternal and tgname=any(array[
       'legacy_wbs_command_evidence_immutable',
       'wbs_scope_transfer_cancel_only',
       'project_wbs_commands_transfer_fence',
       'project_wbs_revisions_transfer_fence',
       'project_wbs_transfer_fence'
     ]) order by tgname`,
  );
  assert.deepEqual(fences.rows, [
    { tgname: "legacy_wbs_command_evidence_immutable" },
    { tgname: "project_wbs_commands_transfer_fence" },
    { tgname: "project_wbs_revisions_transfer_fence" },
    { tgname: "project_wbs_transfer_fence" },
    { tgname: "wbs_scope_transfer_cancel_only" },
  ]);
});

test("WBS transfer cancellation releases only the live reservation without rewriting intent", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());
  await pg.transaction(async (sql) => {
    await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      "transfer-owner",
      "active",
      1,
    ]);
    await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
      "transfer-owner",
      "transfer-owner",
      1,
    ]);
  });
  await pg.query("select * from app_private.provision_repository($1,$2,$3,'USER',$4,'public')", [
    "transfer-repository",
    "transfer-owner",
    "transfer-owner",
    "Transfer source",
  ]);
  await pg.query(
    `insert into app_private.projects(
       id,owner_account_id,owner_account_kind,number,creator,name,is_public,version,created_at,updated_at
     ) values('transfer-project','transfer-owner','USER',null,'transfer-owner','Transfer target',false,1,1,1)`,
  );
  const sourceRevisionId = "10000000-0000-4000-8000-000000000001";
  await pg.transaction(async (sql) => {
    await sql.query("set constraints all deferred");
    await sql.query(
      "insert into app_private.repository_wbs(repository_id,version,head_revision_id) values($1,1,$2)",
      ["transfer-repository", sourceRevisionId],
    );
    await sql.query(
      `insert into app_private.repository_wbs_revisions(
         id,repository_id,version,parent_revision_id,actor_user_id,action,document,at
       ) values($1,$2,1,null,$3,'initialize',$4::jsonb,2)`,
      [
        sourceRevisionId,
        "transfer-repository",
        "transfer-owner",
        JSON.stringify({ schemaVersion: 1, nodes: [] }),
      ],
    );
  });

  const firstTransferId = "20000000-0000-4000-8000-000000000002";
  const secondTransferId = "30000000-0000-4000-8000-000000000003";
  const insertIntent = (id: string, requestId: string) =>
    pg.query(
      `insert into app_private.wbs_scope_transfers(
         id,repository_id,project_id,actor_user_id,request_id,source_version,
         source_head_revision_id,revision_count,command_count,source_hash,requested_at
       ) values($1,'transfer-repository','transfer-project','transfer-owner',$2,1,$3,1,1,$4,3)`,
      [id, requestId, sourceRevisionId, "a".repeat(64)],
    );

  await pg.query("set role line_app");
  try {
    await insertIntent(firstTransferId, "40000000-0000-4000-8000-000000000004");
    await assert.rejects(
      pg.query("update app_private.wbs_scope_transfers set source_hash=$2 where id=$1", [
        firstTransferId,
        "b".repeat(64),
      ]),
    );
    await assert.rejects(
      pg.query("update app_private.wbs_scope_transfers set state='ACTIVE' where id=$1", [
        firstTransferId,
      ]),
    );
    await pg.query(
      "update app_private.wbs_scope_transfers set state='CANCELLED',cancelled_at=4,cancel_request_id=$2 where id=$1",
      [firstTransferId, "50000000-0000-4000-8000-000000000005"],
    );
    await insertIntent(secondTransferId, "60000000-0000-4000-8000-000000000006");
  } finally {
    await pg.query("reset role");
  }

  const intents = await pg.query(
    `select id,state,source_hash,cancelled_at,cancel_request_id
     from app_private.wbs_scope_transfers order by requested_at,id`,
  );
  assert.deepEqual(intents.rows, [
    {
      id: firstTransferId,
      state: "CANCELLED",
      source_hash: "a".repeat(64),
      cancelled_at: 4,
      cancel_request_id: "50000000-0000-4000-8000-000000000005",
    },
    {
      id: secondTransferId,
      state: "REQUESTED",
      source_hash: "a".repeat(64),
      cancelled_at: null,
      cancel_request_id: null,
    },
  ]);

  await pg.query(
    "update app_private.wbs_scope_transfers set state='ACTIVE',activated_at=5,release_sha=$2 where id=$1",
    [secondTransferId, "c".repeat(40)],
  );
  await pg.query("set role line_app");
  try {
    const attempted = await pg.query(
      "update app_private.wbs_scope_transfers set state='CANCELLED',cancelled_at=6,cancel_request_id=$2 where id=$1 returning id",
      [secondTransferId, "70000000-0000-4000-8000-000000000007"],
    );
    assert.deepEqual(attempted.rows, []);
  } finally {
    await pg.query("reset role");
  }
  const active = await pg.query(
    "select state,activated_at,release_sha,cancelled_at,cancel_request_id from app_private.wbs_scope_transfers where id=$1",
    [secondTransferId],
  );
  assert.deepEqual(active.rows, [
    {
      state: "ACTIVE",
      activated_at: 5,
      release_sha: "c".repeat(40),
      cancelled_at: null,
      cancel_request_id: null,
    },
  ]);
});

test("Repository runtime privileges match only activated write capabilities", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const readOnly = ["repository_access", "repository_team_access"];
  const tablePrivileges = await pg.query(
    `select c.relname,
      has_table_privilege('line_app', c.oid, 'SELECT') as can_select,
      has_table_privilege('line_app', c.oid, 'INSERT') as can_insert,
      has_table_privilege('line_app', c.oid, 'UPDATE') as can_update,
      has_table_privilege('line_app', c.oid, 'DELETE') as can_delete
     from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private' and c.relname=any($1::text[])
     order by c.relname`,
    [readOnly],
  );
  assert.deepEqual(
    tablePrivileges.rows,
    readOnly.map((relname) => ({
      relname,
      can_select: true,
      can_insert: false,
      can_update: false,
      can_delete: false,
    })),
  );

  const managedDiscussions = await pg.query(
    `select c.relname,
      has_table_privilege('line_app', c.oid, 'SELECT') as can_select,
      has_table_privilege('line_app', c.oid, 'INSERT') as can_insert,
      has_table_privilege('line_app', c.oid, 'UPDATE') as can_update,
      has_table_privilege('line_app', c.oid, 'DELETE') as can_delete
     from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private'
       and c.relname=any(array['discussion_categories','discussion_comments','discussions'])
     order by c.relname`,
  );
  assert.deepEqual(managedDiscussions.rows, [
    {
      relname: "discussion_categories",
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: true,
    },
    {
      relname: "discussion_comments",
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: false,
    },
    {
      relname: "discussions",
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: false,
    },
  ]);

  const discussionColumns = await pg.query(
    `select
      has_column_privilege('line_app','app_private.discussions','title','UPDATE') as can_update_title,
      has_column_privilege('line_app','app_private.discussions','number','UPDATE') as can_update_number,
      has_column_privilege('line_app','app_private.discussions','category_id','UPDATE') as can_update_category,
      has_column_privilege('line_app','app_private.discussions','state','UPDATE') as can_update_state,
      has_column_privilege('line_app','app_private.discussions','is_locked','UPDATE') as can_update_lock,
      has_column_privilege('line_app','app_private.discussions','version','UPDATE') as can_update_version`,
  );
  assert.deepEqual(discussionColumns.rows, [
    {
      can_update_title: true,
      can_update_number: true,
      can_update_category: true,
      can_update_state: true,
      can_update_lock: true,
      can_update_version: true,
    },
  ]);

  const managedResources = await pg.query(
    `select c.relname,
      has_table_privilege('line_app', c.oid, 'SELECT') as can_select,
      has_table_privilege('line_app', c.oid, 'INSERT') as can_insert,
      has_table_privilege('line_app', c.oid, 'UPDATE') as can_update,
      has_table_privilege('line_app', c.oid, 'DELETE') as can_delete
     from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private'
       and c.relname=any(array['repository_labels','repository_milestones'])
     order by c.relname`,
  );
  assert.deepEqual(managedResources.rows, [
    {
      relname: "repository_labels",
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: true,
    },
    {
      relname: "repository_milestones",
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: false,
    },
  ]);

  const accessCoordinator = await pg.query(
    `select
      has_function_privilege(
        'line_app',
        'app_private.mutate_repository_access(text,text,text,text,text,integer)',
        'EXECUTE'
      ) as runtime_execute,
      has_function_privilege(
        'anon',
        'app_private.mutate_repository_access(text,text,text,text,text,integer)',
        'EXECUTE'
      ) as anon_execute,
      has_function_privilege(
        'authenticated',
        'app_private.mutate_repository_access(text,text,text,text,text,integer)',
        'EXECUTE'
      ) as authenticated_execute`,
  );
  assert.deepEqual(accessCoordinator.rows, [
    { runtime_execute: true, anon_execute: false, authenticated_execute: false },
  ]);

  const issueLabels = await pg.query(
    `select
      has_table_privilege('line_app','app_private.issue_labels','SELECT') as can_select,
      has_table_privilege('line_app','app_private.issue_labels','INSERT') as can_insert,
      has_table_privilege('line_app','app_private.issue_labels','UPDATE') as can_update,
      has_table_privilege('line_app','app_private.issue_labels','DELETE') as can_delete`,
  );
  assert.deepEqual(issueLabels.rows, [
    { can_select: true, can_insert: true, can_update: false, can_delete: true },
  ]);

  const repositoryColumns = await pg.query(
    `select
      has_table_privilege('line_app','app_private.repositories','SELECT') as can_select,
      has_table_privilege('line_app','app_private.repositories','INSERT') as can_insert,
      has_column_privilege('line_app','app_private.repositories','next_issue_number','UPDATE') as can_allocate_issue_number,
      has_column_privilege('line_app','app_private.repositories','name','UPDATE') as can_update_name,
      has_column_privilege('line_app','app_private.repositories','visibility','UPDATE') as can_update_visibility,
      has_column_privilege('line_app','app_private.repositories','is_archived','UPDATE') as can_update_archive`,
  );
  assert.deepEqual(repositoryColumns.rows, [
    {
      can_select: true,
      can_insert: false,
      can_allocate_issue_number: false,
      can_update_name: true,
      can_update_visibility: true,
      can_update_archive: true,
    },
  ]);

  const lifecycleRelations = await pg.query(
    `select c.relname,
      has_table_privilege('line_app', c.oid, 'SELECT') as can_select,
      has_table_privilege('line_app', c.oid, 'INSERT') as can_insert,
      has_table_privilege('line_app', c.oid, 'UPDATE') as can_update,
      has_table_privilege('line_app', c.oid, 'DELETE') as can_delete
     from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='app_private'
       and c.relname=any(array[
         'repository_events',
         'repository_name_history',
         'repository_subscriptions'
       ]::text[])
     order by c.relname`,
  );
  assert.deepEqual(lifecycleRelations.rows, [
    {
      relname: "repository_events",
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: false,
    },
    {
      relname: "repository_name_history",
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: false,
    },
    {
      relname: "repository_subscriptions",
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: false,
    },
  ]);

  const issueColumns = await pg.query(
    `select
      has_table_privilege('line_app','app_private.issues','SELECT') as can_select,
      has_column_privilege('line_app','app_private.issues','id','INSERT') as can_insert_id,
      has_column_privilege('line_app','app_private.issues','milestone_id','INSERT') as can_insert_milestone,
      has_column_privilege('line_app','app_private.issues','assignee','INSERT') as can_insert_legacy_assignee,
      has_column_privilege('line_app','app_private.issues','status','INSERT') as can_insert_legacy_status,
      has_column_privilege('line_app','app_private.issues','assignee','UPDATE') as can_clear_legacy_assignee,
      has_column_privilege('line_app','app_private.issues','status','UPDATE') as can_clear_legacy_status,
      has_column_privilege('line_app','app_private.issues','state','UPDATE') as can_update_state,
      has_column_privilege('line_app','app_private.issues','state_reason','UPDATE') as can_update_state_reason,
      has_column_privilege('line_app','app_private.issues','workflow_status','UPDATE') as can_update_workflow,
      has_column_privilege('line_app','app_private.issues','title','UPDATE') as can_update_title,
      has_column_privilege('line_app','app_private.issues','body','UPDATE') as can_update_body,
      has_column_privilege('line_app','app_private.issues','criteria','UPDATE') as can_update_criteria,
      has_column_privilege('line_app','app_private.issues','milestone_id','UPDATE') as can_update_milestone,
      has_column_privilege('line_app','app_private.issues','is_locked','UPDATE') as can_update_lock,
      has_column_privilege('line_app','app_private.issues','lock_reason','UPDATE') as can_update_lock_reason,
      has_column_privilege('line_app','app_private.issues','version','UPDATE') as can_update_version,
      has_column_privilege('line_app','app_private.issues','updated_at','UPDATE') as can_update_timestamp,
      has_table_privilege('line_app','app_private.issues','DELETE') as can_delete`,
  );
  assert.deepEqual(issueColumns.rows, [
    {
      can_select: true,
      can_insert_id: true,
      can_insert_milestone: false,
      can_insert_legacy_assignee: false,
      can_insert_legacy_status: false,
      can_clear_legacy_assignee: true,
      can_clear_legacy_status: true,
      can_update_state: true,
      can_update_state_reason: true,
      can_update_workflow: true,
      can_update_title: true,
      can_update_body: true,
      can_update_criteria: true,
      can_update_milestone: true,
      can_update_lock: true,
      can_update_lock_reason: true,
      can_update_version: true,
      can_update_timestamp: true,
      can_delete: false,
    },
  ]);

  const issueAssignees = await pg.query(
    `select
      has_table_privilege('line_app','app_private.issue_assignees','SELECT') as can_select,
      has_table_privilege('line_app','app_private.issue_assignees','INSERT') as can_insert,
      has_table_privilege('line_app','app_private.issue_assignees','UPDATE') as can_update,
      has_table_privilege('line_app','app_private.issue_assignees','DELETE') as can_delete`,
  );
  assert.deepEqual(issueAssignees.rows, [
    {
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: true,
    },
  ]);
});

test("repository effective access combines direct and active same-organization Team grants", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  await pg.transaction(async (sql) => {
    for (const userId of ["repository-owner", "team-user", "removed-team-user"]) {
      await sql.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
        userId,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,$3)", [
        userId,
        userId,
        1,
      ]);
    }
  });

  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-a",
    "repository-owner",
    "organization-a",
    "Organization A",
    2,
  ]);
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-b",
    "repository-owner",
    "organization-b",
    "Organization B",
    3,
  ]);

  for (const userId of ["team-user", "removed-team-user"]) {
    await pg.query(
      "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values($1,$2,'active',1,$3)",
      ["organization-a", userId, 4],
    );
  }

  await pg.query(
    `with inserted as (
       insert into app_private.teams(id,organization_account_id,name,slug,created_by_user_id,created_at)
       values($1,$2,$3,$4,$5,$6) returning *
     ) select app_private.claim_scoped_namespace_name(
       'organization-team-slug','ORGANIZATION',organization_account_id,'TEAM',id,slug,created_at
     ) from inserted`,
    ["team-a", "organization-a", "Team A", "team-a", "repository-owner", 5],
  );
  for (const userId of ["team-user", "removed-team-user"]) {
    await pg.query(
      "insert into app_private.team_memberships(team_id,user_id,name,status) values($1,$2,$3,'active')",
      ["team-a", userId, userId],
    );
  }

  await pg.query(
    `with inserted as (
       insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version)
       values($1,$2,'ORGANIZATION',$3,'private',1) returning *
     ) select app_private.claim_scoped_namespace_name(
       'repository-name','OWNER_ACCOUNT',owner_account_id,'REPOSITORY',id,name,5
     ) from inserted`,
    ["repository-a", "organization-a", "Repository A"],
  );
  await pg.query(
    `with inserted as (
       insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version)
       values($1,$2,'ORGANIZATION',$3,'private',1) returning *
     ) select app_private.claim_scoped_namespace_name(
       'repository-name','OWNER_ACCOUNT',owner_account_id,'REPOSITORY',id,name,5
     ) from inserted`,
    ["repository-b", "organization-b", "Repository B"],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'read',1)",
    ["repository-a", "repository-owner"],
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,$2,'triage',1)",
    ["repository-a", "team-user"],
  );
  await pg.query(
    "insert into app_private.repository_team_access(repository_id,organization_id,team_id,capability,version) values($1,$2,$3,'write',1)",
    ["repository-a", "organization-a", "team-a"],
  );

  const effective = await pg.query(
    "select user_id,permissions from app_private.repository_effective_access where repository_id=$1 order by user_id",
    ["repository-a"],
  );
  assert.deepEqual(effective.rows, [
    { user_id: "removed-team-user", permissions: ["write"] },
    { user_id: "repository-owner", permissions: ["admin", "read"] },
    { user_id: "team-user", permissions: ["triage", "write"] },
  ]);

  await pg.query(
    "update app_private.team_memberships set status='removed',version=version+1 where team_id=$1 and user_id=$2",
    ["team-a", "removed-team-user"],
  );
  const afterRemoval = await pg.query(
    "select user_id,permissions from app_private.repository_effective_access where repository_id=$1 order by user_id",
    ["repository-a"],
  );
  assert.deepEqual(afterRemoval.rows, [
    { user_id: "repository-owner", permissions: ["admin", "read"] },
    { user_id: "team-user", permissions: ["triage", "write"] },
  ]);

  await assert.rejects(
    pg.query(
      "insert into app_private.repository_team_access(repository_id,organization_id,team_id,capability,version) values($1,$2,$3,'read',1)",
      ["repository-b", "organization-b", "team-a"],
    ),
  );

  await pg.query(
    "update app_private.organizations set status='inactive',version=version+1 where account_id=$1",
    ["organization-a"],
  );
  const inactive = await pg.query(
    "select user_id from app_private.repository_effective_access where repository_id=$1",
    ["repository-a"],
  );
  assert.deepEqual(inactive.rows, []);

  const privilege = await pg.query(
    "select has_table_privilege('line_app','app_private.repository_effective_access','SELECT') as effective_access_read",
  );
  assert.deepEqual(privilege.rows, [{ effective_access_read: true }]);
});
