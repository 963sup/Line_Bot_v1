-- Repository-scoped goal/checkpoint objects, distinct from Project milestones.

create table app_private.repository_milestones (
  id text primary key,
  repository_id text not null references app_private.repositories(id),
  number bigint not null,
  title text not null,
  description text not null default '',
  status text not null,
  due_at bigint,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint repository_milestones_number_check check (number > 0),
  constraint repository_milestones_title_check check (length(btrim(title)) between 1 and 160),
  constraint repository_milestones_description_check check (length(description) <= 5000),
  constraint repository_milestones_status_check check (status in ('open','closed')),
  constraint repository_milestones_version_check check (version > 0),
  constraint repository_milestones_repository_number_unique unique (repository_id, number),
  constraint repository_milestones_repository_id_key unique (repository_id, id)
);
create index repository_milestones_repository_status on app_private.repository_milestones(repository_id, status, number);
alter table app_private.repository_milestones enable row level security;
revoke all on app_private.repository_milestones from public, anon, authenticated, line_app;
grant insert, select, update on app_private.repository_milestones to line_app;
create policy backend on app_private.repository_milestones for all to line_app using (true) with check (true);
