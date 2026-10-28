-- Intelligence owns only durable technical attempts and target receipt references.
create table app_private.intelligence_document_intakes (
 id uuid primary key,
 actor_user_id text not null references app_private.users(id),
 request_id uuid not null,
 repository_id text not null references app_private.repositories(id),
 file_id uuid not null,
 file_revision_id uuid not null,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 intent_fingerprint text not null check(intent_fingerprint ~ '^[0-9a-f]{64}$'),
 state text not null check(state in ('STARTED','UNKNOWN','COMPLETED')),
 target_document_id text,
 target_revision_id text,
 unique(actor_user_id,request_id),
 foreign key(repository_id,file_id,file_revision_id,file_sha256)
  references app_private.file_revisions(repository_id,file_id,id,sha256),
 check(
  (state='COMPLETED' and target_document_id is not null and target_revision_id is not null)
  or (state in ('STARTED','UNKNOWN') and target_document_id is null and target_revision_id is null)
 )
);
create index intelligence_document_intakes_source
 on app_private.intelligence_document_intakes(repository_id,file_id,file_revision_id);

alter table app_private.intelligence_document_intakes enable row level security;
revoke all on app_private.intelligence_document_intakes from public,anon,authenticated,line_app;
grant select,insert,update(state,target_document_id,target_revision_id)
 on app_private.intelligence_document_intakes to line_app;
create policy backend_read on app_private.intelligence_document_intakes
 for select to line_app using(true);
create policy backend_insert on app_private.intelligence_document_intakes
 for insert to line_app with check(true);
create policy backend_complete on app_private.intelligence_document_intakes
 for update to line_app using(true) with check(true);

-- Commercial extraction technical jobs and immutable observations; no business draft copy.
create table app_private.document_extraction_jobs (
 id uuid primary key,
 actor_user_id text not null references app_private.users(id),
 command_id uuid not null,
 repository_id text not null references app_private.repositories(id),
 file_id uuid not null,
 file_revision_id uuid not null,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 command jsonb not null,
 intent_fingerprint text not null check(intent_fingerprint ~ '^[0-9a-f]{64}$'),
 profile jsonb not null,
 page_count integer not null check(page_count between 1 and 24),
 byte_length integer not null check(byte_length between 1 and 558512),
 input_token_count integer not null check(input_token_count between 0 and 64000),
 dispatch_token uuid not null,
 version integer not null default 1 check(version>0),
 lease_until bigint not null,
 state text not null check(state in ('RESERVED','DISPATCHED','READY','FAILED','OUTCOME_UNKNOWN')),
 dispatch_count integer not null default 0 check(dispatch_count in (0,1)),
 extraction_result_id uuid,
 failure_code text,
 failure_stage text,
 unique(actor_user_id,command_id),
 unique(id,repository_id),
 foreign key(repository_id,file_id,file_revision_id,file_sha256)
 references app_private.file_revisions(repository_id,file_id,id,sha256),
 check((state='RESERVED' and dispatch_count=0) or (state<>'RESERVED' and dispatch_count=1)),
 check((state='READY')=(extraction_result_id is not null)),
 check((failure_code is null)=(failure_stage is null))
);
create table app_private.document_extraction_results (
 id uuid primary key,
 job_id uuid not null unique,
 repository_id text not null,
 result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=524288),
 result_fingerprint text not null check(result_fingerprint ~ '^[0-9a-f]{64}$'),
 unique(id,job_id),
 foreign key(job_id,repository_id) references app_private.document_extraction_jobs(id,repository_id)
);
alter table app_private.document_extraction_jobs add constraint extraction_job_result
 foreign key(extraction_result_id,id) references app_private.document_extraction_results(id,job_id);

alter table app_private.document_extraction_jobs enable row level security;
alter table app_private.document_extraction_results enable row level security;
revoke all on app_private.document_extraction_jobs,app_private.document_extraction_results from public,anon,authenticated,line_app;
grant select,insert on app_private.document_extraction_jobs,app_private.document_extraction_results to line_app;
grant update(dispatch_token,version,lease_until,state,dispatch_count,extraction_result_id,failure_code,failure_stage)
 on app_private.document_extraction_jobs to line_app;
create policy backend_read on app_private.document_extraction_jobs for select to line_app using(true);
create policy backend_insert on app_private.document_extraction_jobs for insert to line_app with check(true);
create policy backend_transition on app_private.document_extraction_jobs for update to line_app using(true) with check(true);
create policy backend_read on app_private.document_extraction_results for select to line_app using(true);
create policy backend_insert on app_private.document_extraction_results for insert to line_app with check(true);
