-- Account-owned authored User status and durable exact-replay evidence.

create table app_private.user_profile_statuses (
  user_id text primary key references app_private.users(id),
  message text,
  emoji text,
  limited_availability boolean not null,
  expires_at bigint,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint user_profile_statuses_message_check
    check (message is null or (length(message) between 1 and 80)),
  constraint user_profile_statuses_emoji_check
    check (emoji is null or (length(emoji) between 1 and 64)),
  constraint user_profile_statuses_version_check check (version > 0),
  constraint user_profile_statuses_expires_at_check
    check (expires_at is null or expires_at between 1 and 8640000000000000),
  constraint user_profile_statuses_time_check check (updated_at >= created_at)
);
alter table app_private.user_profile_statuses enable row level security;
revoke all on app_private.user_profile_statuses from public, anon, authenticated, line_app;
grant select, insert, update on app_private.user_profile_statuses to line_app;
create policy "backend" on app_private.user_profile_statuses
  as permissive for all to line_app using (true) with check (true);

create table app_private.user_profile_status_change_receipts (
  user_id text not null references app_private.users(id),
  request_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  at bigint not null,
  primary key (user_id, request_id),
  constraint user_profile_status_change_receipts_fingerprint_check
    check (length(fingerprint) = 64)
);
create index user_profile_status_change_receipts_time
  on app_private.user_profile_status_change_receipts(user_id, at desc, request_id);
alter table app_private.user_profile_status_change_receipts enable row level security;
revoke all on app_private.user_profile_status_change_receipts
  from public, anon, authenticated, line_app;
grant select, insert on app_private.user_profile_status_change_receipts to line_app;
create policy "backend" on app_private.user_profile_status_change_receipts
  as permissive for all to line_app using (true) with check (true);
