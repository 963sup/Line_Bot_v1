-- Organization Team membership relationship.

create table app_private.team_memberships (
  team_id text not null,
  user_id text not null,
  name text not null,
  status text not null,
  version integer default 1 not null,
  constraint team_memberships_pkey primary key (team_id, user_id),
  constraint team_memberships_name_check check (length(name) between 1 and 80),
  constraint team_memberships_status_check check (status in ('pending', 'active', 'removed')),
  constraint team_memberships_version_check check (version > 0),
  constraint team_memberships_team_fkey foreign key (team_id) references app_private.teams(id),
  constraint team_memberships_user_fkey foreign key (user_id)
    references app_private.users(id)
);
create index team_membership_user_lookup
  on app_private.team_memberships(user_id, team_id);
alter table app_private.team_memberships enable row level security;
revoke all on app_private.team_memberships from public, anon, authenticated, line_app;
grant insert, select, update on app_private.team_memberships to line_app;
create policy backend on app_private.team_memberships
  for all to line_app using (true) with check (true);

-- Identity/Access is the sole writer of TeamMaintainer assignments.
-- TeamMembership remains a separate participation fact and never grants authority by itself.
