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
