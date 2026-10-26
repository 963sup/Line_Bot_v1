-- One-time external identity provisioning capabilities; no provider access token is stored.

-- 跨瀏覽器只交接一次性權能；不儲存 LINE／Google access token。
create table app_private.google_link_requests (
  id uuid primary key,
  user_id text not null unique references app_private.users(id) on delete cascade,
  user_version integer not null check (user_version > 0),
  token_hash text not null unique,
  expires_at bigint not null,
  google_id uuid,
  google_sub text,
  google_email text,
  constraint google_link_result_complete check (
    (google_id is null and google_sub is null and google_email is null) or
    (google_id is not null and google_sub is not null and google_email is not null)
  )
);
create index google_link_requests_expiry on app_private.google_link_requests(expires_at);
alter table app_private.google_link_requests enable row level security;
revoke all on app_private.google_link_requests from public, anon, authenticated, line_app;
grant select, insert, update, delete on app_private.google_link_requests to line_app;
create policy backend on app_private.google_link_requests for all to line_app using (true) with check (true);
