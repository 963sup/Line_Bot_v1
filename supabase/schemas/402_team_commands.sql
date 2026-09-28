-- Team command replay/evidence owned by Team.

create table app_private.team_commands (
  actor_user_id text not null,
  request_id uuid not null,
  organization_account_id text not null,
  team_id text not null,
  fingerprint text not null,
  result jsonb not null,
  action text not null,
  details jsonb not null,
  created_at bigint not null,
  constraint team_commands_pkey primary key (actor_user_id, request_id),
  constraint team_commands_action_check
    check (action in ('create-team', 'rename-team', 'join', 'membership', 'maintainer')),
  constraint team_commands_actor_fkey foreign key (actor_user_id)
    references app_private.users(id),
  constraint team_commands_team_scope_fkey foreign key (team_id, organization_account_id)
    references app_private.teams(id, organization_account_id)
);
create index team_command_team_lookup on app_private.team_commands(team_id, created_at);
alter table app_private.team_commands enable row level security;
revoke all on app_private.team_commands from public, anon, authenticated, line_app;
grant insert, select on app_private.team_commands to line_app;
create policy backend on app_private.team_commands
  for all to line_app using (true) with check (true);
