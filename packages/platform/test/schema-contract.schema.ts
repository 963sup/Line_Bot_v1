import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "../src/testing/postgres.js";

test("declarative schemas clean-build from current sources", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  const result = await pg.query(
    "select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relkind in ('r','v')",
  );
  const [row] = result.rows as Array<{ count: number }>;
  assert.ok(row);
  assert.ok(row.count > 0);
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
  assert.equal((fk.rows[0] as { count: number }).count, 1);

  const fn = await pg.query(
    "select p.prosecdef, r.rolname as owner from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure('app_private.attendance_account_active(uuid,bigint)')",
  );
  assert.equal(fn.rows.length, 1);
  assert.equal((fn.rows[0] as { prosecdef: boolean }).prosecdef, true);
  assert.notEqual((fn.rows[0] as { owner: string }).owner, "line_app");
});

test("runtime provisioning creates governance roots only through narrow coordinators", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "creator",
    "active",
    1,
  ]);

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

test("repository effective access combines direct and active same-organization Team grants", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());

  for (const userId of ["repository-owner", "team-user", "removed-team-user"]) {
    await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      userId,
      "active",
      1,
    ]);
  }

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
    "insert into app_private.teams(id,organization_account_id,name,slug,created_by_user_id,created_at) values($1,$2,$3,$4,$5,$6)",
    ["team-a", "organization-a", "Team A", "team-a", "repository-owner", 5],
  );
  for (const userId of ["team-user", "removed-team-user"]) {
    await pg.query(
      "insert into app_private.team_memberships(team_id,user_id,name,status) values($1,$2,$3,'active')",
      ["team-a", userId, userId],
    );
  }

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'ORGANIZATION',$3,'private',1)",
    ["repository-a", "organization-a", "Repository A"],
  );
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values($1,$2,'ORGANIZATION',$3,'private',1)",
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
    "select user_id,capability from app_private.repository_effective_access where repository_id=$1 order by user_id",
    ["repository-a"],
  );
  assert.deepEqual(effective.rows, [
    { user_id: "removed-team-user", capability: "write" },
    { user_id: "repository-owner", capability: "read" },
    { user_id: "team-user", capability: "write" },
  ]);

  await pg.query(
    "update app_private.team_memberships set status='removed',version=version+1 where team_id=$1 and user_id=$2",
    ["team-a", "removed-team-user"],
  );
  const afterRemoval = await pg.query(
    "select user_id,capability from app_private.repository_effective_access where repository_id=$1 order by user_id",
    ["repository-a"],
  );
  assert.deepEqual(afterRemoval.rows, [
    { user_id: "repository-owner", capability: "read" },
    { user_id: "team-user", capability: "write" },
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
