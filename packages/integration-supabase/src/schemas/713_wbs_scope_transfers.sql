-- Durable authorization intent and immutable evidence for the one-way Repository to Project WBS move.
create table app_private.wbs_scope_transfers (
  id uuid primary key,
  repository_id text not null references app_private.repository_wbs(repository_id),
  project_id text not null references app_private.projects(id),
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  state text not null default 'REQUESTED' check(state in ('REQUESTED','ACTIVE','CANCELLED')),
  source_version integer not null check(source_version > 0),
  source_head_revision_id uuid not null,
  revision_count integer not null check(revision_count > 0),
  command_count integer not null check(command_count > 0),
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  requested_at bigint not null,
  activated_at bigint,
  release_sha text,
  cancelled_at bigint,
  cancel_request_id uuid,
  unique(actor_user_id,request_id),
  unique(id,repository_id,project_id),
  foreign key(repository_id,source_version,source_head_revision_id)
    references app_private.repository_wbs_revisions(repository_id,version,id),
  check(
    (state='REQUESTED' and activated_at is null and release_sha is null and cancelled_at is null and cancel_request_id is null)
    or
    (state='ACTIVE' and activated_at is not null and release_sha ~ '^[0-9a-f]{40}$' and cancelled_at is null and cancel_request_id is null)
    or
    (state='CANCELLED' and activated_at is null and release_sha is null and cancelled_at is not null and cancel_request_id is not null)
  )
);
create unique index wbs_scope_transfers_live_repository
  on app_private.wbs_scope_transfers(repository_id) where state in ('REQUESTED','ACTIVE');
create unique index wbs_scope_transfers_live_project
  on app_private.wbs_scope_transfers(project_id) where state in ('REQUESTED','ACTIVE');
create unique index wbs_scope_transfers_cancel_request
  on app_private.wbs_scope_transfers(actor_user_id,cancel_request_id)
  where cancel_request_id is not null;

create table app_private.legacy_wbs_command_evidence (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  project_id text not null,
  transfer_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(transfer_id,repository_id,project_id)
    references app_private.wbs_scope_transfers(id,repository_id,project_id),
  foreign key(project_id,revision_id)
    references app_private.project_wbs_revisions(project_id,id)
);
create index legacy_wbs_command_evidence_source
  on app_private.legacy_wbs_command_evidence(repository_id,revision_id);

alter table app_private.wbs_scope_transfers enable row level security;
alter table app_private.legacy_wbs_command_evidence enable row level security;
revoke all on app_private.wbs_scope_transfers,app_private.legacy_wbs_command_evidence
  from public,anon,authenticated,line_app;
grant select on app_private.wbs_scope_transfers to line_app;
grant select on app_private.legacy_wbs_command_evidence to line_app;
grant insert(
  id,repository_id,project_id,actor_user_id,request_id,source_version,
  source_head_revision_id,revision_count,command_count,source_hash,requested_at
) on app_private.wbs_scope_transfers to line_app;
grant update(state,cancelled_at,cancel_request_id) on app_private.wbs_scope_transfers to line_app;
create policy backend_read on app_private.wbs_scope_transfers
  for select to line_app using(true);
create policy backend_request on app_private.wbs_scope_transfers
  for insert to line_app with check(
    state='REQUESTED' and activated_at is null and release_sha is null
  );
create policy backend_cancel on app_private.wbs_scope_transfers
  for update to line_app
  using(state='REQUESTED')
  with check(state='CANCELLED' and cancelled_at is not null and cancel_request_id is not null);
create policy backend_read on app_private.legacy_wbs_command_evidence
  for select to line_app using(true);

create or replace function app_private.enforce_wbs_scope_transfer_cancel()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
begin
  if current_user='line_app' and (
    old.state<>'REQUESTED' or new.state<>'CANCELLED'
    or new.id<>old.id or new.repository_id<>old.repository_id or new.project_id<>old.project_id
    or new.actor_user_id<>old.actor_user_id or new.request_id<>old.request_id
    or new.source_version<>old.source_version or new.source_head_revision_id<>old.source_head_revision_id
    or new.revision_count<>old.revision_count or new.command_count<>old.command_count
    or new.source_hash<>old.source_hash or new.requested_at<>old.requested_at
    or new.activated_at is not null or new.release_sha is not null
    or new.cancelled_at is null or new.cancel_request_id is null
  ) then
    raise exception 'wbs_scope_transfer_cancel_only' using errcode='55000';
  end if;
  return new;
end
$function$;
revoke all on function app_private.enforce_wbs_scope_transfer_cancel()
  from public,anon,authenticated,line_app;
grant execute on function app_private.enforce_wbs_scope_transfer_cancel() to line_app;
create trigger wbs_scope_transfer_cancel_only
before update on app_private.wbs_scope_transfers
for each row execute function app_private.enforce_wbs_scope_transfer_cancel();

create or replace function app_private.reject_legacy_wbs_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'legacy_wbs_evidence_immutable' using errcode='55000';
end
$function$;
revoke all on function app_private.reject_legacy_wbs_evidence_mutation()
  from public,anon,authenticated,line_app;
create trigger legacy_wbs_command_evidence_immutable
before update or delete on app_private.legacy_wbs_command_evidence
for each statement execute function app_private.reject_legacy_wbs_evidence_mutation();

create or replace function app_private.wbs_scope_transfer_blocks_project(p_project_id text)
returns boolean
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
begin
  perform app_private.lock_governance('shared');
  return exists(
    select 1 from app_private.wbs_scope_transfers transfer
    where transfer.project_id=p_project_id and transfer.state='REQUESTED'
  );
end
$function$;
revoke all on function app_private.wbs_scope_transfer_blocks_project(text)
  from public,anon,authenticated,line_app;
grant execute on function app_private.wbs_scope_transfer_blocks_project(text) to line_app;

create policy transfer_reservation_insert on app_private.project_wbs
  as restrictive for insert to line_app
  with check(not app_private.wbs_scope_transfer_blocks_project(project_id));
create policy transfer_reservation_update on app_private.project_wbs
  as restrictive for update to line_app
  using(not app_private.wbs_scope_transfer_blocks_project(project_id))
  with check(not app_private.wbs_scope_transfer_blocks_project(project_id));
create policy transfer_reservation_insert on app_private.project_wbs_revisions
  as restrictive for insert to line_app
  with check(not app_private.wbs_scope_transfer_blocks_project(project_id));
create policy transfer_reservation_insert on app_private.project_wbs_commands
  as restrictive for insert to line_app
  with check(not app_private.wbs_scope_transfer_blocks_project(project_id));

create or replace function app_private.reject_requested_project_wbs_write()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
declare
  target_project_id text := coalesce(new.project_id,old.project_id);
begin
  if current_user='line_app'
     and app_private.wbs_scope_transfer_blocks_project(target_project_id) then
    raise exception 'project_wbs_transfer_requested' using errcode='55000';
  end if;
  return coalesce(new,old);
end
$function$;
revoke all on function app_private.reject_requested_project_wbs_write()
  from public,anon,authenticated,line_app;
grant execute on function app_private.reject_requested_project_wbs_write() to line_app;

create trigger project_wbs_transfer_fence
before insert or update or delete on app_private.project_wbs
for each row execute function app_private.reject_requested_project_wbs_write();
create trigger project_wbs_revisions_transfer_fence
before insert or update or delete on app_private.project_wbs_revisions
for each row execute function app_private.reject_requested_project_wbs_write();
create trigger project_wbs_commands_transfer_fence
before insert or update or delete on app_private.project_wbs_commands
for each row execute function app_private.reject_requested_project_wbs_write();
