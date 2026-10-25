-- Intelligence owns current document-understanding lifecycle and receipts.
-- File remains the immutable source owner referenced by every revision.
create table app_private.intelligence_processing_runs (
 id uuid primary key,
 repository_id text not null references app_private.repositories(id),
 file_id uuid not null,
 file_revision_id uuid not null,
 version integer not null check(version>0),
 head_revision_id uuid not null,
 unique(repository_id,id),
 unique(repository_id,id,file_id,file_revision_id),
 foreign key(repository_id,file_id,file_revision_id)
  references app_private.file_revisions(repository_id,file_id,id)
);
create table app_private.intelligence_processing_revisions (
 id uuid primary key,
 run_id uuid not null,
 repository_id text not null,
 file_id uuid not null,
 file_revision_id uuid not null,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 version integer not null check(version>0),
 parent_revision_id uuid,
 actor_user_id text not null references app_private.users(id),
 at bigint not null,
 state text not null check(state in ('RUNNING','FAILED','READY','SAVED','DISCARDED')),
 attempt_id uuid not null,
 processor_id text not null check(length(processor_id) between 1 and 120),
 processor_version text not null check(length(processor_version) between 1 and 200),
 processor_kind text not null check(processor_kind in ('parser','ocr','ai')),
 raw_result jsonb,
 saved_result jsonb,
 edits jsonb not null check(jsonb_typeof(edits)='array' and jsonb_array_length(edits)<=500),
 failure text check(failure='PROCESSING_UNAVAILABLE'),
 unique(repository_id,run_id,id),
 unique(repository_id,run_id,version,id),
 unique(run_id,version),
 foreign key(repository_id,run_id,file_id,file_revision_id)
  references app_private.intelligence_processing_runs(repository_id,id,file_id,file_revision_id),
 foreign key(repository_id,file_id,file_revision_id,file_sha256)
  references app_private.file_revisions(repository_id,file_id,id,sha256),
 foreign key(repository_id,run_id,parent_revision_id)
  references app_private.intelligence_processing_revisions(repository_id,run_id,id),
 check((version=1 and parent_revision_id is null and state='RUNNING') or (version>1 and parent_revision_id is not null)),
 check((state in ('RUNNING','FAILED') and raw_result is null and saved_result is null and edits='[]'::jsonb)
  or (state in ('READY','DISCARDED') and raw_result is not null and saved_result is null and edits='[]'::jsonb)
  or (state='SAVED' and raw_result is not null and saved_result is not null)),
 check((state='FAILED' and failure is not null) or (state<>'FAILED' and failure is null))
);
alter table app_private.intelligence_processing_runs add constraint intelligence_processing_runs_head_fkey
 foreign key(repository_id,id,version,head_revision_id)
 references app_private.intelligence_processing_revisions(repository_id,run_id,version,id)
 deferrable initially deferred;
create table app_private.intelligence_processing_commands (
 actor_user_id text not null references app_private.users(id),
 request_id uuid not null,
 repository_id text not null references app_private.repositories(id),
 run_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 processing_revision_id uuid not null,
 primary key(actor_user_id,request_id),
 foreign key(repository_id,run_id,processing_revision_id)
  references app_private.intelligence_processing_revisions(repository_id,run_id,id)
);
create index intelligence_processing_runs_source on app_private.intelligence_processing_runs(repository_id,file_id,file_revision_id);
alter table app_private.intelligence_processing_runs enable row level security;
alter table app_private.intelligence_processing_revisions enable row level security;
alter table app_private.intelligence_processing_commands enable row level security;
revoke all on app_private.intelligence_processing_runs,app_private.intelligence_processing_revisions,app_private.intelligence_processing_commands from public,anon,authenticated,line_app;
grant select,insert,update(version,head_revision_id) on app_private.intelligence_processing_runs to line_app;
grant select,insert on app_private.intelligence_processing_revisions,app_private.intelligence_processing_commands to line_app;
create policy backend on app_private.intelligence_processing_runs for all to line_app using(true) with check(true);
create policy backend_read on app_private.intelligence_processing_revisions for select to line_app using(true);
create policy backend_insert on app_private.intelligence_processing_revisions for insert to line_app with check(true);
create policy backend_read on app_private.intelligence_processing_commands for select to line_app using(true);
create policy backend_insert on app_private.intelligence_processing_commands for insert to line_app with check(true);

-- Immutable evidence copied from the retired File processing relations by the
-- separately governed operator cutover. Runtime processing never writes these.
create table app_private.intelligence_legacy_processing_runs (
 id uuid primary key,
 repository_id text not null references app_private.repositories(id),
 file_id uuid not null,
 file_revision_id uuid not null,
 version integer not null check(version>0),
 head_revision_id uuid not null,
 cutover_id uuid not null,
 unique(repository_id,id),
 unique(repository_id,id,file_id,file_revision_id),
 foreign key(repository_id,file_id,file_revision_id) references app_private.file_revisions(repository_id,file_id,id)
);
create table app_private.intelligence_legacy_processing_revisions (
 id uuid primary key,
 run_id uuid not null,
 repository_id text not null,
 file_id uuid not null,
 file_revision_id uuid not null,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 version integer not null check(version>0),
 parent_revision_id uuid,
 actor_user_id text not null references app_private.users(id),
 at bigint not null,
 state text not null check(state in ('RUNNING','FAILED','READY','SAVED','DISCARDED')),
 attempt_id uuid not null,
 processor_id text not null check(length(processor_id) between 1 and 120),
 processor_version text not null check(length(processor_version) between 1 and 200),
 processor_kind text not null check(processor_kind in ('parser','ocr','ai')),
 raw_result jsonb,
 saved_result jsonb,
 edits jsonb not null check(jsonb_typeof(edits)='array' and jsonb_array_length(edits)<=500),
 failure text check(failure='PROCESSING_UNAVAILABLE'),
 cutover_id uuid not null,
 unique(repository_id,run_id,id),
 unique(repository_id,run_id,version,id),
 unique(run_id,version),
 foreign key(repository_id,run_id,file_id,file_revision_id)
  references app_private.intelligence_legacy_processing_runs(repository_id,id,file_id,file_revision_id),
 foreign key(repository_id,file_id,file_revision_id,file_sha256)
  references app_private.file_revisions(repository_id,file_id,id,sha256),
 foreign key(repository_id,run_id,parent_revision_id)
  references app_private.intelligence_legacy_processing_revisions(repository_id,run_id,id),
 check((version=1 and parent_revision_id is null and state='RUNNING') or (version>1 and parent_revision_id is not null)),
 check((state in ('RUNNING','FAILED') and raw_result is null and saved_result is null and edits='[]'::jsonb)
  or (state in ('READY','DISCARDED') and raw_result is not null and saved_result is null and edits='[]'::jsonb)
  or (state='SAVED' and raw_result is not null and saved_result is not null)),
 check((state='FAILED' and failure is not null) or (state<>'FAILED' and failure is null))
);
alter table app_private.intelligence_legacy_processing_runs add constraint intelligence_legacy_processing_runs_head_fkey
 foreign key(repository_id,id,version,head_revision_id)
 references app_private.intelligence_legacy_processing_revisions(repository_id,run_id,version,id)
 deferrable initially deferred;
create table app_private.intelligence_legacy_processing_commands (
 actor_user_id text not null references app_private.users(id),
 request_id uuid not null,
 repository_id text not null references app_private.repositories(id),
 run_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 processing_revision_id uuid not null,
 namespace text not null default 'legacy-file-processing' check(namespace='legacy-file-processing'),
 cutover_id uuid not null,
 primary key(namespace,actor_user_id,request_id),
 foreign key(repository_id,run_id,processing_revision_id)
  references app_private.intelligence_legacy_processing_revisions(repository_id,run_id,id)
);
create table app_private.intelligence_processing_history_cutovers (
 id uuid primary key,
 release_revision text not null check(release_revision ~ '^[0-9a-f]{40}$'),
 at bigint not null,
 runs_count bigint not null check(runs_count>=0),
 revisions_count bigint not null check(revisions_count>=0),
 receipts_count bigint not null check(receipts_count>=0),
 runs_sha256 text not null check(runs_sha256 ~ '^[0-9a-f]{64}$'),
 revisions_sha256 text not null check(revisions_sha256 ~ '^[0-9a-f]{64}$'),
 receipts_sha256 text not null check(receipts_sha256 ~ '^[0-9a-f]{64}$'),
 unique(release_revision)
);
alter table app_private.intelligence_legacy_processing_runs add constraint intelligence_legacy_processing_runs_cutover_fkey
 foreign key(cutover_id) references app_private.intelligence_processing_history_cutovers(id) deferrable initially deferred;
alter table app_private.intelligence_legacy_processing_revisions add constraint intelligence_legacy_processing_revisions_cutover_fkey
 foreign key(cutover_id) references app_private.intelligence_processing_history_cutovers(id) deferrable initially deferred;
alter table app_private.intelligence_legacy_processing_commands add constraint intelligence_legacy_processing_commands_cutover_fkey
 foreign key(cutover_id) references app_private.intelligence_processing_history_cutovers(id) deferrable initially deferred;
create index intelligence_legacy_processing_runs_source on app_private.intelligence_legacy_processing_runs(repository_id,file_id,file_revision_id);
alter table app_private.intelligence_legacy_processing_runs enable row level security;
alter table app_private.intelligence_legacy_processing_revisions enable row level security;
alter table app_private.intelligence_legacy_processing_commands enable row level security;
alter table app_private.intelligence_processing_history_cutovers enable row level security;
revoke all on app_private.intelligence_legacy_processing_runs,app_private.intelligence_legacy_processing_revisions,
 app_private.intelligence_legacy_processing_commands,app_private.intelligence_processing_history_cutovers from public,anon,authenticated,line_app;
grant select on app_private.intelligence_legacy_processing_runs,app_private.intelligence_legacy_processing_revisions,
 app_private.intelligence_legacy_processing_commands,app_private.intelligence_processing_history_cutovers to line_app;
create policy backend_read on app_private.intelligence_legacy_processing_runs for select to line_app using(true);
create policy backend_read on app_private.intelligence_legacy_processing_revisions for select to line_app using(true);
create policy backend_read on app_private.intelligence_legacy_processing_commands for select to line_app using(true);
create policy backend_read on app_private.intelligence_processing_history_cutovers for select to line_app using(true);
