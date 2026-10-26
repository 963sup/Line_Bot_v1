-- File owns immutable revisions with external object bytes, durable upload intents and File receipts.
-- file_processing_* and processing-kind receipts are retained historical rows; Intelligence is their
-- current authorized reader and File no longer writes ProcessingRuns.
create table app_private.repository_files (
 id uuid primary key,
 repository_id text not null references app_private.repositories(id),
 version integer not null check(version>0),
 head_revision_id uuid not null,
 unique(repository_id,id)
);
create table app_private.file_revisions (
 id uuid primary key,
 file_id uuid not null,
 repository_id text not null,
 version integer not null check(version>0),
 parent_revision_id uuid,
 actor_user_id text not null references app_private.users(id),
 at bigint not null,
 name text not null check(length(name) between 1 and 255),
 media_type text not null check(length(media_type) between 3 and 160),
 byte_length integer not null check(byte_length between 1 and 47185920),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 unique(repository_id,file_id,id),
 unique(repository_id,file_id,id,sha256),
 unique(repository_id,file_id,version,id),
 unique(file_id,version),
 foreign key(repository_id,file_id) references app_private.repository_files(repository_id,id),
 foreign key(repository_id,file_id,parent_revision_id) references app_private.file_revisions(repository_id,file_id,id),
 check((version=1 and parent_revision_id is null) or (version>1 and parent_revision_id is not null))
);
alter table app_private.repository_files add constraint repository_files_head_fkey
 foreign key(repository_id,id,version,head_revision_id)
 references app_private.file_revisions(repository_id,file_id,version,id)
 deferrable initially deferred;

-- An immutable intent is persisted before external object I/O. A matching
-- file_commands receipt, not the intent itself, proves Finalize committed.
create table app_private.file_upload_intents (
 actor_user_id text not null references app_private.users(id),
 request_id uuid not null,
 repository_id text not null references app_private.repositories(id),
 file_id uuid not null,
 revision_id uuid not null unique,
 expected_version integer not null check(expected_version between 0 and 2147483646),
 parent_revision_id uuid,
 at bigint not null,
 name text not null check(length(name) between 1 and 255),
 media_type text not null check(length(media_type) between 3 and 160),
 byte_length integer not null check(byte_length between 1 and 47185920),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 last_attempt_at timestamptz not null default clock_timestamp(),
 abandoned_at timestamptz,
 -- Historical column name: this is the last independently verified object-absence cursor,
 -- not proof that an unknown provider write can no longer complete.
 reclaimed_at timestamptz,
 check(reclaimed_at is null or abandoned_at is not null),
 primary key(actor_user_id,request_id),
 unique(repository_id,file_id,revision_id),
 foreign key(repository_id,file_id,parent_revision_id)
  references app_private.file_revisions(repository_id,file_id,id),
 check((expected_version=0 and parent_revision_id is null)
  or (expected_version>0 and parent_revision_id is not null))
);

create table app_private.file_processing_runs (
 id uuid primary key,
 repository_id text not null,
 file_id uuid not null,
 file_revision_id uuid not null,
 version integer not null check(version>0),
 head_revision_id uuid not null,
 unique(repository_id,id),
 unique(repository_id,id,file_id,file_revision_id),
 foreign key(repository_id,file_id,file_revision_id) references app_private.file_revisions(repository_id,file_id,id)
);
create table app_private.file_processing_revisions (
 id uuid primary key,
 run_id uuid not null,
 repository_id text not null,
 file_id uuid not null,
 file_revision_id uuid not null,
 file_sha256 text not null,
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
  references app_private.file_processing_runs(repository_id,id,file_id,file_revision_id),
 foreign key(repository_id,file_id,file_revision_id,file_sha256)
  references app_private.file_revisions(repository_id,file_id,id,sha256),
 foreign key(repository_id,run_id,parent_revision_id)
  references app_private.file_processing_revisions(repository_id,run_id,id),
 check((version=1 and parent_revision_id is null and state='RUNNING') or (version>1 and parent_revision_id is not null)),
 check((state in ('RUNNING','FAILED') and raw_result is null and saved_result is null and edits='[]'::jsonb)
  or (state='READY' and raw_result is not null and saved_result is null and edits='[]'::jsonb)
  or (state='DISCARDED' and raw_result is not null and saved_result is null and edits='[]'::jsonb)
  or (state='SAVED' and raw_result is not null and saved_result is not null and jsonb_typeof(saved_result)='object')),
 check((state='FAILED' and failure is not null) or (state<>'FAILED' and failure is null))
);
alter table app_private.file_processing_runs add constraint file_processing_runs_head_fkey
 foreign key(repository_id,id,version,head_revision_id)
 references app_private.file_processing_revisions(repository_id,run_id,version,id)
 deferrable initially deferred;

create table app_private.file_commands (
 actor_user_id text not null references app_private.users(id),
 request_id uuid not null,
 repository_id text not null,
 kind text not null check(kind in ('file','processing')),
 entity_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 file_revision_id uuid,
 processing_revision_id uuid,
 primary key(actor_user_id,request_id),
 foreign key(repository_id,entity_id,file_revision_id)
  references app_private.file_revisions(repository_id,file_id,id),
 foreign key(repository_id,entity_id,processing_revision_id)
  references app_private.file_processing_revisions(repository_id,run_id,id),
 check((kind='file' and file_revision_id is not null and processing_revision_id is null)
  or (kind='processing' and file_revision_id is null and processing_revision_id is not null))
);
create index repository_files_scope on app_private.repository_files(repository_id,id);
create index file_upload_intents_reclamation on app_private.file_upload_intents
 ((coalesce(reclaimed_at,last_attempt_at)),actor_user_id,request_id);
create index file_processing_runs_source on app_private.file_processing_runs(repository_id,file_id,file_revision_id);

alter table app_private.repository_files enable row level security;
alter table app_private.file_revisions enable row level security;
alter table app_private.file_upload_intents enable row level security;
alter table app_private.file_processing_runs enable row level security;
alter table app_private.file_processing_revisions enable row level security;
alter table app_private.file_commands enable row level security;
revoke all on app_private.repository_files,app_private.file_revisions,app_private.file_processing_runs,
 app_private.file_processing_revisions,app_private.file_upload_intents,app_private.file_commands from public,anon,authenticated,line_app;
grant select,insert,update(version,head_revision_id) on app_private.repository_files to line_app;
grant select on app_private.file_processing_runs,app_private.file_processing_revisions to line_app;
-- Compatibility evidence only: File processing relations are read-only during
-- the cutover. New processing writes must target 619_intelligence_processing.sql.
revoke insert,update,delete on app_private.file_processing_runs,app_private.file_processing_revisions from line_app;
grant select,insert on app_private.file_revisions,app_private.file_upload_intents,app_private.file_commands to line_app;
grant update(last_attempt_at,abandoned_at,reclaimed_at) on app_private.file_upload_intents to line_app;
create policy backend on app_private.repository_files for all to line_app using(true) with check(true);
create policy backend_read on app_private.file_processing_runs for select to line_app using(true);
create policy backend_read on app_private.file_revisions for select to line_app using(true);
create policy backend_insert on app_private.file_revisions for insert to line_app with check(true);
create policy backend_read on app_private.file_processing_revisions for select to line_app using(true);
create policy backend_read on app_private.file_upload_intents for select to line_app using(true);
create policy backend_insert on app_private.file_upload_intents for insert to line_app with check(true);
create policy backend_update on app_private.file_upload_intents for update to line_app using(true) with check(true);
create policy backend_read on app_private.file_commands for select to line_app using(true);
create policy backend_insert on app_private.file_commands for insert to line_app with check(kind='file');
