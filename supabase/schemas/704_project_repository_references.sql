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
create index project_repository_references_repository
  on app_private.project_repository_references(repository_id, project_id);

alter table app_private.project_repository_references enable row level security;
revoke all on app_private.project_repository_references
  from public, anon, authenticated, line_app;
grant select, insert, update, delete
  on app_private.project_repository_references to line_app;
create policy backend on app_private.project_repository_references
  for all to line_app using (true) with check (true);

-- Project-owned standing admission intent, not Issue content or source access.
create table app_private.project_repository_imports (
  project_id text not null,
  repository_id text not null,
  issue_state text not null check (issue_state in ('OPEN','CLOSED','ALL')),
  enabled boolean not null,
  delegate_user_id text not null references app_private.users(id),
  delegate_status_version integer not null check (delegate_status_version > 0),
  checked_at bigint not null default 0,
  primary key (project_id,repository_id),
  foreign key (project_id,repository_id)
    references app_private.project_repository_references(project_id,repository_id)
);
create index project_repository_imports_pending
  on app_private.project_repository_imports(checked_at,project_id,repository_id) where enabled;
alter table app_private.project_repository_imports enable row level security;
revoke all on app_private.project_repository_imports from public,anon,authenticated,line_app;
grant select,insert,update on app_private.project_repository_imports to line_app;
create policy backend on app_private.project_repository_imports
  for all to line_app using (true) with check (true);

-- Explicit removal is durable: automation must not recreate a removed Item.
create table app_private.project_repository_import_exclusions (
  project_id text not null references app_private.projects(id),
  issue_id text not null references app_private.issues(id),
  primary key (project_id,issue_id)
);
alter table app_private.project_repository_import_exclusions enable row level security;
revoke all on app_private.project_repository_import_exclusions from public,anon,authenticated,line_app;
grant select,insert,delete on app_private.project_repository_import_exclusions to line_app;
create policy backend on app_private.project_repository_import_exclusions
  for all to line_app using (true) with check (true);
