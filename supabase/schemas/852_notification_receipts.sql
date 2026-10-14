-- Durable exact-replay receipts and cancellation tombstones for explicit notifications.
create table app_private.notification_receipts (
 command_key text primary key, fingerprint text, notification_id uuid unique references app_private.notifications(id), cancelled boolean not null default false,
 check(cancelled or (fingerprint is not null and notification_id is not null))
);
alter table app_private.notification_receipts enable row level security;
revoke all on app_private.notification_receipts from public,anon,authenticated,line_app;
grant select,insert,update on app_private.notification_receipts to line_app;
create policy backend on app_private.notification_receipts to line_app using(true) with check(true);
