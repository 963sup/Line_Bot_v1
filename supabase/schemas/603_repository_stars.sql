-- Repository-owned User → Repository interest relationship; never grants access.

create table app_private.repository_stars (
  repository_id text not null references app_private.repositories(id),
  user_id text not null references app_private.users(id),
  created_at bigint not null,
  primary key (repository_id, user_id)
);
create index repository_stars_user_created
  on app_private.repository_stars(user_id, created_at desc, repository_id);
create index repository_stars_repository_created
  on app_private.repository_stars(repository_id, created_at desc, user_id);
alter table app_private.repository_stars enable row level security;
revoke all on app_private.repository_stars from public, anon, authenticated, line_app;
grant select, insert, delete on app_private.repository_stars to line_app;
create policy "backend" on app_private.repository_stars
  as permissive for all to line_app using (true) with check (true);
