-- Project command replay and immutable aggregate evidence.

create table app_private.project_commands (
  actor text not null references app_private.users(id),
  request_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  created_at bigint not null,
  primary key (actor, request_id)
);

create table app_private.project_events (
  project_id text not null references app_private.projects(id),
  version integer not null,
  actor text not null references app_private.users(id),
  action text not null,
  data jsonb not null default '{}'::jsonb,
  at bigint not null,
  primary key (project_id, version),
  constraint project_events_data_check check (jsonb_typeof(data)='object')
);
create index project_events_actor on app_private.project_events(actor, at);

alter table app_private.project_commands enable row level security;
alter table app_private.project_events enable row level security;

revoke all on app_private.project_commands from public, anon, authenticated, line_app;
revoke all on app_private.project_events from public, anon, authenticated, line_app;

grant select, insert on app_private.project_commands to line_app;
grant select, insert on app_private.project_events to line_app;

create policy backend on app_private.project_commands
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_events
  for all to line_app using (true) with check (true);
