-- Repository-owned direct User access grants.

create table app_private."repository_access" (
  "repository_id" text not null,
  "principal_id" text not null,
  "capability" text not null,
  "version" integer not null,
  constraint "repository_access_pkey" primary key (repository_id, principal_id),
  constraint "repository_access_capability_check" check (capability = any (array['read'::text, 'triage'::text, 'write'::text, 'admin'::text])),
  constraint "repository_access_version_check" check (version > 0),
  constraint "repository_access_repository_id_fkey" foreign key (repository_id) references app_private.repositories(id),
  constraint "repository_access_principal_id_fkey" foreign key (principal_id) references app_private.users(id)
);
alter table app_private."repository_access" enable row level security;
revoke all on app_private."repository_access" from public, anon, authenticated, line_app;
grant insert, select, update on app_private.repository_access to line_app;
create policy "backend" on app_private.repository_access as permissive for all to line_app using (true) with check (true);

-- Repository owns the grant; Team continues to own TeamMembership. organization_id is
-- present only for Organization-owned repositories so the Repository and Team share one scope.
