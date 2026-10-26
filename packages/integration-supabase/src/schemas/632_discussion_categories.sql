-- Discussion-owned Repository-scoped category definitions.

create table app_private.discussion_categories (
  id text not null,
  repository_id text not null,
  name text not null,
  slug text not null,
  description text not null default '',
  emoji text not null default '',
  is_answerable boolean not null default false,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint discussion_categories_pkey primary key (id),
  constraint discussion_categories_repository_id_id_unique unique (repository_id, id),
  constraint discussion_categories_repository_slug_unique unique (repository_id, slug),
  constraint discussion_categories_name_check check (length(btrim(name)) between 1 and 120),
  constraint discussion_categories_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint discussion_categories_description_check check (length(description) <= 500),
  constraint discussion_categories_emoji_check check (length(emoji) <= 32),
  constraint discussion_categories_version_check check (version > 0),
  constraint discussion_categories_time_check check (created_at <= updated_at),
  constraint discussion_categories_repository_fkey
    foreign key (repository_id) references app_private.repositories(id)
);

alter table app_private.discussion_categories enable row level security;
revoke all on app_private.discussion_categories from public, anon, authenticated, line_app;
grant select, insert, update, delete on app_private.discussion_categories to line_app;
create policy backend on app_private.discussion_categories
  for all to line_app using (true) with check (true);

alter table app_private.discussions
  add constraint discussions_category_scope_fkey
  foreign key (repository_id, category_id)
  references app_private.discussion_categories(repository_id, id);
