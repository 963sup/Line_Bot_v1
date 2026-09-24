-- Repository-owned Organization Team access grants; TeamMembership remains Team-owned.

create table app_private."repository_team_access" (
  "repository_id" text not null,
  "organization_id" text not null,
  "team_id" text not null,
  "capability" text not null,
  "version" integer not null,
  constraint "repository_team_access_pkey" primary key (repository_id, team_id),
  constraint "repository_team_access_capability_check" check (capability = any (array['read'::text, 'triage'::text, 'write'::text, 'admin'::text])),
  constraint "repository_team_access_version_check" check (version > 0),
  constraint "repository_team_access_repository_scope_fkey"
    foreign key (repository_id, organization_id)
    references app_private.repositories(id, owner_account_id),
  constraint "repository_team_access_team_scope_fkey"
    foreign key (team_id, organization_id)
    references app_private.teams(id, organization_account_id)
);
create index repository_team_access_team_lookup
  on app_private.repository_team_access(team_id, repository_id);
alter table app_private."repository_team_access" enable row level security;
revoke all on app_private."repository_team_access" from public, anon, authenticated, line_app;
grant insert, select, update on app_private.repository_team_access to line_app;
create policy "backend" on app_private.repository_team_access as permissive for all to line_app using (true) with check (true);


-- User interest in a Repository. The relationship remains Repository-owned; Account
-- identity is referenced by stable UserId and current access is rechecked by the application.
