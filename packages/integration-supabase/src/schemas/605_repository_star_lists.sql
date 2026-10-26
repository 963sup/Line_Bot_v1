-- Repository-owned User curated Lists over the User's current Repository stars.

create table app_private.repository_star_lists (
  id text primary key,
  owner_user_id text not null references app_private.users(id),
  name text not null,
  description text not null,
  visibility text not null,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint repository_star_lists_owner_pair unique (id, owner_user_id),
  constraint repository_star_lists_name_check check (length(btrim(name)) between 1 and 100),
  constraint repository_star_lists_description_check check (length(description) <= 500),
  constraint repository_star_lists_visibility_check check (visibility in ('private', 'public')),
  constraint repository_star_lists_version_check check (version > 0),
  constraint repository_star_lists_created_at_check check (created_at >= 0),
  constraint repository_star_lists_updated_at_check check (updated_at >= created_at)
);
create index repository_star_lists_owner_updated
  on app_private.repository_star_lists(owner_user_id, updated_at desc, id);
create index repository_star_lists_public_updated
  on app_private.repository_star_lists(updated_at desc, id)
  where visibility='public';

create table app_private.repository_star_list_items (
  list_id text not null,
  owner_user_id text not null,
  repository_id text not null,
  added_at bigint not null,
  primary key (list_id, repository_id),
  constraint repository_star_list_items_list_fkey
    foreign key (list_id, owner_user_id)
    references app_private.repository_star_lists(id, owner_user_id)
    on delete cascade,
  constraint repository_star_list_items_star_fkey
    foreign key (repository_id, owner_user_id)
    references app_private.repository_stars(repository_id, user_id)
    on delete cascade,
  constraint repository_star_list_items_added_at_check check (added_at >= 0)
);
create index repository_star_list_items_list_added
  on app_private.repository_star_list_items(list_id, added_at desc, repository_id);
create index repository_star_list_items_star
  on app_private.repository_star_list_items(repository_id, owner_user_id, list_id);

alter table app_private.repository_star_lists enable row level security;
alter table app_private.repository_star_list_items enable row level security;
revoke all on app_private.repository_star_lists from public, anon, authenticated, line_app;
revoke all on app_private.repository_star_list_items from public, anon, authenticated, line_app;
grant select, insert, update, delete on app_private.repository_star_lists to line_app;
grant select, insert, delete on app_private.repository_star_list_items to line_app;
create policy backend on app_private.repository_star_lists
  for all to line_app using (true) with check (true);
create policy backend on app_private.repository_star_list_items
  for all to line_app using (true) with check (true);
