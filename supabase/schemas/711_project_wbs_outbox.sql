-- Version-bound Project WBS publication events. Publishing and enqueueing are one transaction.
create table app_private.project_wbs_outbox (
  id uuid primary key,
  event_no bigint generated always as identity unique,
  project_id text not null,
  baseline_id uuid not null unique,
  revision_id uuid not null,
  at bigint not null,
  lease_token uuid,
  lease_until bigint,
  acknowledged_at bigint,
  foreign key (project_id, baseline_id) references app_private.project_wbs_baselines(project_id,id),
  foreign key (project_id, revision_id) references app_private.project_wbs_revisions(project_id,id),
  check ((lease_token is null) = (lease_until is null))
);
create index project_wbs_outbox_pending on app_private.project_wbs_outbox(event_no) where acknowledged_at is null;
alter table app_private.project_wbs_outbox enable row level security;
revoke all on app_private.project_wbs_outbox from public, anon, authenticated, line_app;
grant select,insert on app_private.project_wbs_outbox to line_app;
grant update(lease_token,lease_until,acknowledged_at) on app_private.project_wbs_outbox to line_app;
grant usage on sequence app_private.project_wbs_outbox_event_no_seq to line_app;
create policy backend on app_private.project_wbs_outbox to line_app using(true) with check(true);
