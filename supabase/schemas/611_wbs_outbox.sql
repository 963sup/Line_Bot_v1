-- Version-bound publication events. Publishing and enqueueing are one WBS transaction.
create table app_private.repository_wbs_outbox (
  id uuid primary key,
  event_no bigint generated always as identity unique,
  repository_id text not null,
  baseline_id uuid not null unique,
  revision_id uuid not null,
  at bigint not null,
  lease_token uuid,
  lease_until bigint,
  acknowledged_at bigint,
  foreign key (repository_id, baseline_id) references app_private.repository_wbs_baselines(repository_id,id),
  foreign key (repository_id, revision_id) references app_private.repository_wbs_revisions(repository_id,id),
  check ((lease_token is null) = (lease_until is null))
);
create index repository_wbs_outbox_pending on app_private.repository_wbs_outbox(event_no) where acknowledged_at is null;
alter table app_private.repository_wbs_outbox enable row level security;
revoke all on app_private.repository_wbs_outbox from public, anon, authenticated, line_app;
grant select,insert on app_private.repository_wbs_outbox to line_app;
grant update(lease_token,lease_until,acknowledged_at) on app_private.repository_wbs_outbox to line_app;
grant usage on sequence app_private.repository_wbs_outbox_event_no_seq to line_app;
create policy backend_read on app_private.repository_wbs_outbox for select to line_app
  using(not app_private.wbs_scope_transfer_blocks_repository(repository_id));
create policy backend_insert on app_private.repository_wbs_outbox for insert to line_app
  with check(not app_private.wbs_scope_transfer_blocks_repository(repository_id));
create policy backend_update on app_private.repository_wbs_outbox for update to line_app
  using(not app_private.wbs_scope_transfer_blocks_repository(repository_id))
  with check(not app_private.wbs_scope_transfer_blocks_repository(repository_id));
create trigger repository_wbs_outbox_transfer_fence before insert or update or delete
  on app_private.repository_wbs_outbox for each row
  execute function app_private.reject_active_repository_wbs_write();
