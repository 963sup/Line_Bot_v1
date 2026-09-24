-- Repository-owned reusable classification objects.

create table app_private.repository_labels (
  id text primary key,
  repository_id text not null references app_private.repositories(id),
  name text not null,
  color text not null,
  description text not null default '',
  version integer not null,
  constraint repository_labels_name_check check (length(btrim(name)) between 1 and 50),
  constraint repository_labels_color_check check (color ~ '^[0-9a-fA-F]{6}$'),
  constraint repository_labels_description_check check (length(description) <= 500),
  constraint repository_labels_version_check check (version > 0),
  constraint repository_labels_repository_name_unique unique (repository_id, name),
  constraint repository_labels_repository_id_key unique (repository_id, id)
);
create index repository_labels_repository on app_private.repository_labels(repository_id, name, id);
alter table app_private.repository_labels enable row level security;
revoke all on app_private.repository_labels from public, anon, authenticated, line_app;
grant insert, select, update, delete on app_private.repository_labels to line_app;
create policy backend on app_private.repository_labels for all to line_app using (true) with check (true);
