-- Identity/Access-owned feature permission grants.

create table app_private."permission_grants" (
  "user_id" text not null,
  "permission" app_private.permission_name not null,
  "workplace_id" uuid,
  "user_version" integer not null,
  "granted_by" text not null,
  "granted_at" bigint default ((EXTRACT(epoch FROM clock_timestamp()) * (1000)::numeric))::bigint not null,
  constraint "permission_grants_user_id_permission_workplace_id_key" UNIQUE NULLS NOT DISTINCT (user_id, permission, workplace_id),
  constraint "permission_grants_check" CHECK (((workplace_id IS NULL) OR (permission = 'workplaces.manage'))),
  constraint "permission_grants_granted_by_check" CHECK ((length(TRIM(BOTH FROM granted_by)) > 0)),
  constraint "permission_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_private.users(id)
);
CREATE INDEX permission_workplaces ON app_private.permission_grants USING btree (workplace_id) WHERE (workplace_id IS NOT NULL);
alter table app_private."permission_grants" enable row level security;
revoke all on app_private."permission_grants" from public, anon, authenticated, line_app;
grant delete, insert, select on app_private."permission_grants" to line_app;
create policy "backend" on app_private."permission_grants" as permissive for all to "line_app" using (true) with check (true);
