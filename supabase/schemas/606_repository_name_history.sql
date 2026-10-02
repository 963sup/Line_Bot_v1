-- Repository-owned old-name aliases retained for followRenames locator resolution.

create table app_private.repository_name_history (
  repository_id text not null references app_private.repositories(id),
  old_name text not null,
  renamed_at bigint not null,
  constraint repository_name_history_name_check check (
    old_name = btrim(old_name) and length(old_name) between 1 and 100
  ),
  constraint repository_name_history_renamed_at_check check (renamed_at >= 0)
);
create unique index repository_name_history_repository_name
  on app_private.repository_name_history(repository_id, lower(old_name));
create index repository_name_history_lookup
  on app_private.repository_name_history(lower(old_name), repository_id);

alter table app_private.repository_name_history enable row level security;
revoke all on app_private.repository_name_history from public, anon, authenticated, line_app;
grant select, insert on app_private.repository_name_history to line_app;
create policy backend on app_private.repository_name_history
  for all to line_app using (true) with check (true);
