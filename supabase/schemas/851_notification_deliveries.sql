-- Notification delivery attempts.

create table app_private."notification_deliveries" (
  "notification_id" uuid not null,
  "channel" text not null,
  "delivery_key" text not null,
  "status" text not null,
  "attempts" integer not null,
  "updated_at" bigint not null,
  constraint "notification_deliveries_pkey" primary key (notification_id, channel),
  constraint "notification_deliveries_status_check" check (status = any (array['pending'::text, 'sent'::text, 'failed'::text, 'unknown'::text])),
  constraint "notification_deliveries_attempts_check" check (attempts >= 0),
  constraint "notification_deliveries_key_unique" unique (delivery_key),
  constraint "notification_deliveries_notification_fkey" foreign key (notification_id) references app_private.notifications(id)
);
alter table app_private."notification_deliveries" enable row level security;
revoke all on app_private."notification_deliveries" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."notification_deliveries" to line_app;
create policy "backend" on app_private."notification_deliveries" as permissive for all to "line_app" using (true) with check (true);
