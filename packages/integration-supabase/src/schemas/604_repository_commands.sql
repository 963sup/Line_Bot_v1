-- Repository command replay receipts.

create table app_private.repository_commands (
  actor text not null,
  request_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  at bigint not null,
  constraint repository_commands_pkey primary key (actor, request_id),
  constraint repository_commands_actor_fkey foreign key (actor) references app_private.users(id),
  constraint repository_commands_at_check check (at >= 0)
);
alter table app_private.repository_commands enable row level security;
revoke all on app_private.repository_commands from public, anon, authenticated, line_app;
grant insert, select on app_private.repository_commands to line_app;
create policy backend on app_private.repository_commands
  for all to line_app using (true) with check (true);
