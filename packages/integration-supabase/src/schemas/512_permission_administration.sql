-- Identity/Access permission administrators, command receipts and invariant guards.

create table app_private."permission_administrators" (
  "user_id" text not null,
  "user_version" integer not null,
  "granted_by" text not null,
  "granted_at" bigint default ((EXTRACT(epoch FROM clock_timestamp()) * (1000)::numeric))::bigint not null,
  constraint "permission_administrators_pkey" PRIMARY KEY (user_id),
  constraint "permission_administrators_granted_by_check" CHECK ((length(TRIM(BOTH FROM granted_by)) > 0)),
  constraint "permission_administrators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_private.users(id)
);
alter table app_private."permission_administrators" enable row level security;
revoke all on app_private."permission_administrators" from public, anon, authenticated, line_app;
grant select on app_private."permission_administrators" to line_app;
create policy "backend" on app_private."permission_administrators" as permissive for select to "line_app" using (true);
create table app_private."permission_commands" (
  "actor" text not null,
  "request_id" uuid not null,
  "target" text not null,
  "command" jsonb not null,
  "before_grants" jsonb not null,
  "after_grants" jsonb not null,
  "result" jsonb not null,
  "at" bigint not null,
  constraint "permission_commands_pkey" PRIMARY KEY (actor, request_id),
  constraint "permission_commands_actor_fkey" FOREIGN KEY (actor) REFERENCES app_private.users(id),
  constraint "permission_commands_target_fkey" FOREIGN KEY (target) REFERENCES app_private.users(id)
);
CREATE INDEX permission_history ON app_private.permission_commands USING btree (target, at DESC, request_id DESC);
alter table app_private."permission_commands" enable row level security;
revoke all on app_private."permission_commands" from public, anon, authenticated, line_app;
grant insert, select on app_private."permission_commands" to line_app;
create policy "backend" on app_private."permission_commands" as permissive for all to "line_app" using (true) with check (true);

create table app_private.permission_subject_versions (
  user_id text primary key references app_private.users(id),
  version integer not null default 0,
  constraint permission_subject_versions_version_check check (version >= 0)
);
alter table app_private.permission_subject_versions enable row level security;
revoke all on app_private.permission_subject_versions from public, anon, authenticated, line_app;
grant select, insert, update on app_private.permission_subject_versions to line_app;
create policy backend on app_private.permission_subject_versions
  for all to line_app using (true) with check (true);

