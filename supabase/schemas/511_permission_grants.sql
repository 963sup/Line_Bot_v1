-- Identity/Access-owned feature permission grants.

create table app_private."permission_grants" (
  "user_id" text not null,
  "permission" app_private.permission_name not null,
  "user_version" integer not null,
  "granted_by" text not null,
  "granted_at" bigint default ((EXTRACT(epoch FROM clock_timestamp()) * (1000)::numeric))::bigint not null,
  constraint "permission_grants_user_id_permission_key" UNIQUE (user_id, permission),
  constraint "permission_grants_granted_by_check" CHECK ((length(TRIM(BOTH FROM granted_by)) > 0)),
  constraint "permission_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_private.users(id)
);
alter table app_private."permission_grants" enable row level security;
revoke all on app_private."permission_grants" from public, anon, authenticated, line_app;
grant delete, insert, select on app_private."permission_grants" to line_app;
create policy "backend" on app_private."permission_grants" as permissive for all to "line_app" using (true) with check (true);
