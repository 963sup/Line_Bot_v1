-- User -> Repository Subscribable state. This is distinct from Star and Notification delivery facts.

create table app_private.repository_subscriptions (
  repository_id text not null references app_private.repositories(id),
  user_id text not null references app_private.users(id),
  state text not null,
  version integer not null,
  updated_at bigint not null,
  constraint repository_subscriptions_pkey primary key (repository_id, user_id),
  constraint repository_subscriptions_state_check check (
    state in ('SUBSCRIBED','UNSUBSCRIBED','IGNORED')
  ),
  constraint repository_subscriptions_version_check check (version > 0),
  constraint repository_subscriptions_updated_at_check check (updated_at >= 0)
);
create index repository_subscriptions_user_lookup
  on app_private.repository_subscriptions(user_id, repository_id);

alter table app_private.repository_subscriptions enable row level security;
revoke all on app_private.repository_subscriptions from public, anon, authenticated, line_app;
grant select, insert, update on app_private.repository_subscriptions to line_app;
create policy backend on app_private.repository_subscriptions
  for all to line_app using (true) with check (true);
