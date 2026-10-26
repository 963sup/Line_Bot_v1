-- Issue command replay receipts.

create table app_private."issue_commands" (
  "actor" text not null, "request_id" uuid not null, "fingerprint" text not null, "result" jsonb not null,
  constraint "issue_commands_pkey" primary key (actor, request_id),
  constraint "issue_commands_actor_fkey" foreign key (actor) references app_private.users(id)
);
alter table app_private."issue_commands" enable row level security;
revoke all on app_private."issue_commands" from public, anon, authenticated, line_app;
grant insert, select on app_private.issue_commands to line_app;
create policy "backend" on app_private.issue_commands as permissive for all to line_app using (true) with check (true);
