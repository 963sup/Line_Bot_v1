-- Project-owned status updates, separate from Issue state/events.

create table app_private.project_status_updates (
  id text not null,
  project_id text not null,
  author text not null,
  body text,
  status text,
  start_date text,
  target_date text,
  deleted_at bigint,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (id),
  constraint project_status_updates_project_id_id_unique unique (project_id, id),
  constraint project_status_updates_project_fkey
    foreign key (project_id) references app_private.projects(id),
  constraint project_status_updates_author_fkey
    foreign key (author) references app_private.users(id),
  constraint project_status_updates_body_check check (
    body is null or length(body) <= 20000
  ),
  constraint project_status_updates_status_check check (
    status is null or status in ('AT_RISK','COMPLETE','INACTIVE','OFF_TRACK','ON_TRACK')
  ),
  constraint project_status_updates_start_date_check check (
    start_date is null or start_date ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  constraint project_status_updates_target_date_check check (
    target_date is null or target_date ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  constraint project_status_updates_version_check check (version > 0),
  constraint project_status_updates_time_check check (created_at <= updated_at)
);
create index project_status_updates_project_created
  on app_private.project_status_updates(project_id, created_at desc, id)
  where deleted_at is null;

alter table app_private.project_status_updates enable row level security;
revoke all on app_private.project_status_updates from public, anon, authenticated, line_app;
grant select, insert, update on app_private.project_status_updates to line_app;
create policy backend on app_private.project_status_updates
  for all to line_app using (true) with check (true);
