-- Project-owned collaborator grants. User and Team identity remain owned by their source domains.

create table app_private.project_user_access (
  project_id text not null references app_private.projects(id),
  user_id text not null references app_private.users(id),
  role text not null,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (project_id, user_id),
  constraint project_user_access_role_check check (role in ('READ','WRITE','ADMIN')),
  constraint project_user_access_version_check check (version > 0),
  constraint project_user_access_time_check check (created_at <= updated_at)
);

create table app_private.project_team_access (
  project_id text not null references app_private.projects(id),
  team_id text not null references app_private.teams(id),
  role text not null,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (project_id, team_id),
  constraint project_team_access_role_check check (role in ('READ','WRITE','ADMIN')),
  constraint project_team_access_version_check check (version > 0),
  constraint project_team_access_time_check check (created_at <= updated_at)
);

create index project_user_access_user on app_private.project_user_access(user_id, project_id);
create index project_team_access_team on app_private.project_team_access(team_id, project_id);

alter table app_private.project_user_access enable row level security;
alter table app_private.project_team_access enable row level security;

revoke all on app_private.project_user_access from public, anon, authenticated, line_app;
revoke all on app_private.project_team_access from public, anon, authenticated, line_app;

grant select, insert, update, delete on app_private.project_user_access to line_app;
grant select, insert, update, delete on app_private.project_team_access to line_app;

create policy backend on app_private.project_user_access
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_team_access
  for all to line_app using (true) with check (true);
