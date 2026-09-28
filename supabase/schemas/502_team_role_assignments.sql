-- Identity/Access-owned TeamMaintainer RoleAssignment.

create table app_private.team_role_assignments (
  team_id text not null,
  user_id text not null,
  role text not null,
  status text not null,
  version integer not null,
  user_status_version integer not null,
  membership_version integer not null,
  granted_at bigint not null,
  constraint team_role_assignments_pkey primary key (team_id, user_id, role),
  constraint team_role_assignments_role_check check (role = 'TeamMaintainer'),
  constraint team_role_assignments_status_check check (status in ('active', 'revoked')),
  constraint team_role_assignments_version_check check (version > 0),
  constraint team_role_assignments_user_version_check check (user_status_version > 0),
  constraint team_role_assignments_membership_version_check check (membership_version > 0),
  constraint team_role_assignments_team_fkey foreign key (team_id) references app_private.teams(id),
  constraint team_role_assignments_user_fkey foreign key (user_id)
    references app_private.users(id)
);
alter table app_private.team_role_assignments enable row level security;
revoke all on app_private.team_role_assignments from public, anon, authenticated, line_app;
grant insert, select, update on app_private.team_role_assignments to line_app;
create policy backend on app_private.team_role_assignments
  for all to line_app using (true) with check (true);
