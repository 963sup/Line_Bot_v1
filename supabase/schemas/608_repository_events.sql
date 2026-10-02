-- Durable Repository lifecycle and Repository-owned definition evidence.

create table app_private.repository_events (
  id bigint generated always as identity primary key,
  repository_id text not null references app_private.repositories(id),
  actor_user_id text not null references app_private.users(id),
  action text not null,
  previous_state jsonb not null,
  current_state jsonb not null,
  at bigint not null,
  constraint repository_events_action_check check (
    action in (
      'rename','visibility','archive','unarchive',
      'create-label','update-label','delete-label',
      'create-milestone','update-milestone','open-milestone','close-milestone'
    )
  ),
  constraint repository_events_previous_state_check check (jsonb_typeof(previous_state) = 'object'),
  constraint repository_events_current_state_check check (jsonb_typeof(current_state) = 'object'),
  constraint repository_events_at_check check (at >= 0)
);
create index repository_events_repository_order
  on app_private.repository_events(repository_id, at, id);

alter table app_private.repository_events enable row level security;
revoke all on app_private.repository_events from public, anon, authenticated, line_app;
grant select, insert on app_private.repository_events to line_app;
grant usage, select on sequence app_private.repository_events_id_seq to line_app;
create policy backend on app_private.repository_events
  for all to line_app using (true) with check (true);
