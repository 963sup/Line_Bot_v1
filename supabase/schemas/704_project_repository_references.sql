-- Explicit Project → Repository planning boundary.

create table app_private.project_repository_references (
  project_id text not null references app_private.projects(id),
  repository_id text not null references app_private.repositories(id),
  position integer not null,
  version integer not null,
  primary key (project_id, repository_id),
  constraint project_repository_references_position_check check (position >= 0),
  constraint project_repository_references_version_check check (version > 0)
);
create index project_repository_references_repository on app_private.project_repository_references(repository_id, project_id);
alter table app_private.project_repository_references enable row level security;
revoke all on app_private.project_repository_references from public, anon, authenticated, line_app;
grant insert, select, update, delete on app_private.project_repository_references to line_app;
create policy backend on app_private.project_repository_references for all to line_app using (true) with check (true);
