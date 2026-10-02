-- Discussion command replay and immutable lifecycle/collaboration evidence.

create table app_private.discussion_commands (
  actor text not null references app_private.users(id),
  request_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  created_at bigint not null,
  primary key (actor, request_id)
);

create table app_private.discussion_events (
  discussion_id text not null references app_private.discussions(id),
  version integer not null,
  actor text not null references app_private.users(id),
  action text not null,
  data jsonb not null default '{}'::jsonb,
  at bigint not null,
  primary key (discussion_id, version),
  constraint discussion_events_data_check check (jsonb_typeof(data) = 'object')
);
create index discussion_events_actor on app_private.discussion_events(actor, at);

create table app_private.discussion_category_events (
  category_id text not null,
  version integer not null,
  actor text not null references app_private.users(id),
  action text not null,
  data jsonb not null default '{}'::jsonb,
  at bigint not null,
  primary key (category_id, version),
  constraint discussion_category_events_data_check check (jsonb_typeof(data) = 'object')
);

alter table app_private.discussion_commands enable row level security;
alter table app_private.discussion_events enable row level security;
alter table app_private.discussion_category_events enable row level security;

revoke all on app_private.discussion_commands from public, anon, authenticated, line_app;
revoke all on app_private.discussion_events from public, anon, authenticated, line_app;
revoke all on app_private.discussion_category_events from public, anon, authenticated, line_app;

grant select, insert on app_private.discussion_commands to line_app;
grant select, insert on app_private.discussion_events to line_app;
grant select, insert on app_private.discussion_category_events to line_app;

create policy backend on app_private.discussion_commands
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_events
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_category_events
  for all to line_app using (true) with check (true);
