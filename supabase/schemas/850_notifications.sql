-- Notification aggregate root/read state.

-- User-facing notification delivery/read projection.
-- Notifications reference source facts; they do not own repository discussions or issue lifecycle.

create table app_private."notifications" (
  "id" uuid not null,
  "recipient" text not null,
  "source_type" text not null,
  "source_id" text not null,
  "source_version" text not null,
  "kind" text not null,
  "title" text not null,
  "body" text not null,
  "created_at" bigint not null,
  "read_at" bigint,
  "version" integer not null,
  constraint "notifications_pkey" primary key (id),
  constraint "notifications_kind_check" check (kind = any (array['issue'::text, 'discussion'::text, 'system'::text])),
  constraint "notifications_version_check" check (version > 0),
  constraint "notifications_recipient_fkey" foreign key (recipient) references app_private.users(id)
);
create index notifications_recipient_created on app_private.notifications (recipient, created_at desc, id);
create index notifications_source on app_private.notifications (source_type, source_id, source_version);
alter table app_private."notifications" enable row level security;
revoke all on app_private."notifications" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."notifications" to line_app;
create policy "backend" on app_private."notifications" as permissive for all to "line_app" using (true) with check (true);
