-- Workplace command receipts.

create table app_private."workplace_commands" (
  "request_id" uuid not null,
  "actor" text not null,
  "workplace_id" uuid not null,
  "command" jsonb not null,
  "result" jsonb not null,
  "at" bigint not null,
  constraint "workplace_commands_pkey" PRIMARY KEY (request_id),
  constraint "workplace_commands_actor_fkey" FOREIGN KEY (actor) REFERENCES app_private.users(id),
  constraint "workplace_commands_workplace_id_fkey" FOREIGN KEY (workplace_id) REFERENCES app_private.workplaces(id)
);
CREATE INDEX workplace_commands_site ON app_private.workplace_commands USING btree (workplace_id, at);
alter table app_private."workplace_commands" enable row level security;
revoke all on app_private."workplace_commands" from public, anon, authenticated, line_app;
grant insert, select on app_private."workplace_commands" to line_app;
create policy "backend" on app_private."workplace_commands" as permissive for all to "line_app" using (true) with check (true);
