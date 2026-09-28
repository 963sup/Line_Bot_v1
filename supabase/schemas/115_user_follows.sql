-- Account-owned directional User follow relationships.
-- Followers and following are inbound/outbound reads of the same relationship.

create table app_private.user_follows (
  follower_user_id text not null references app_private.users(id),
  followed_user_id text not null references app_private.users(id),
  created_at bigint not null,
  primary key (follower_user_id, followed_user_id),
  constraint user_follows_not_self_check check (follower_user_id <> followed_user_id)
);
create index user_follows_followed_created
  on app_private.user_follows(followed_user_id, created_at desc, follower_user_id);
create index user_follows_follower_created
  on app_private.user_follows(follower_user_id, created_at desc, followed_user_id);
alter table app_private.user_follows enable row level security;
revoke all on app_private.user_follows from public, anon, authenticated, line_app;
grant select, insert, delete on app_private.user_follows to line_app;
create policy "backend" on app_private.user_follows
  as permissive for all to line_app using (true) with check (true);
