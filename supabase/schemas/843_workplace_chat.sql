-- Workplace chat draft/event state.

create table app_private."workplace_chat_drafts" (
  "actor" text not null,
  "draft" jsonb not null,
  constraint "workplace_chat_drafts_pkey" PRIMARY KEY (actor),
  constraint "workplace_chat_drafts_actor_fkey" FOREIGN KEY (actor) REFERENCES app_private.users(id)
);
alter table app_private."workplace_chat_drafts" enable row level security;
revoke all on app_private."workplace_chat_drafts" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."workplace_chat_drafts" to line_app;
create policy "backend" on app_private."workplace_chat_drafts" as permissive for all to "line_app" using (true) with check (true);

create table app_private."workplace_chat_events" (
  "actor" text not null,
  "event_id" text not null,
  "result" jsonb not null,
  "at" bigint not null,
  constraint "workplace_chat_events_pkey" PRIMARY KEY (actor, event_id),
  constraint "workplace_chat_events_actor_fkey" FOREIGN KEY (actor) REFERENCES app_private.users(id)
);
alter table app_private."workplace_chat_events" enable row level security;
revoke all on app_private."workplace_chat_events" from public, anon, authenticated, line_app;
grant insert, select on app_private."workplace_chat_events" to line_app;
create policy "backend" on app_private."workplace_chat_events" as permissive for all to "line_app" using (true) with check (true);
