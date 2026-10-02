-- Immutable Issue lifecycle and collaboration event evidence.

create table app_private."issue_events" (
  "issue_id" text not null,
  "version" integer not null,
  "actor" text not null,
  "action" text not null,
  "note" text not null,
  "data" jsonb not null default '{}'::jsonb,
  "at" bigint not null,
  constraint "issue_events_pkey" primary key (issue_id, version),
  constraint "issue_events_actor_fkey" foreign key (actor) references app_private.users(id),
  constraint "issue_events_issue_id_fkey" foreign key (issue_id) references app_private.issues(id),
  constraint "issue_events_data_check" check (jsonb_typeof(data) = 'object')
);
create index issue_events_actor on app_private.issue_events (actor);
alter table app_private."issue_events" enable row level security;
revoke all on app_private."issue_events" from public, anon, authenticated, line_app;
grant insert (issue_id,version,actor,action,note,data,at), select
  on app_private.issue_events to line_app;
create policy "backend" on app_private.issue_events
  as permissive for all to line_app using (true) with check (true);
