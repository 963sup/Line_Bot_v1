-- Project-owned planning item referencing Repository-owned Issue content.

create table app_private.project_items (
  id text primary key,
  project_id text not null references app_private.projects(id),
  repository_id text not null references app_private.repositories(id),
  issue_id text not null,
  source_version integer not null,
  position integer not null,
  version integer not null,
  constraint project_items_issue_fkey foreign key (repository_id, issue_id) references app_private.issues(repository_id, id),
  constraint project_items_source_version_check check (source_version > 0),
  constraint project_items_position_check check (position >= 0),
  constraint project_items_version_check check (version > 0),
  constraint project_items_project_issue_unique unique (project_id, repository_id, issue_id)
);
create index project_items_project_position on app_private.project_items(project_id, position, id);
alter table app_private.project_items enable row level security;
-- Project is current-data-only. Runtime DML stays disabled until a real consumer
-- defines Project authorization, version/replay semantics and a public contract.
revoke all on app_private.project_items from public, anon, authenticated, line_app;
