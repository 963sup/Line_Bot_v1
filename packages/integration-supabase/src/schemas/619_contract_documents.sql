-- Contract owns purchase-order intake candidates and confirmed revisions.
create table app_private.contract_documents (
 id uuid primary key,
 repository_id text not null references app_private.repositories(id),
 version integer not null check(version>0),
 head_revision_id uuid not null,
 unique(repository_id,id)
);

create table app_private.contract_document_revisions (
 id uuid primary key,
 document_id uuid not null,
 repository_id text not null,
 version integer not null check(version>0),
 parent_revision_id uuid,
 actor_user_id text not null references app_private.users(id),
 at bigint not null,
 state text not null check(state in ('DRAFT','CONFIRMED')),
 schema_version integer not null check(schema_version=1),
 file_id uuid not null,
 file_revision_id uuid not null,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 candidate jsonb not null check(jsonb_typeof(candidate)='object'),
 diagnostics jsonb not null check(jsonb_typeof(diagnostics)='array'),
 acknowledgement_reason text,
 source_review_attestation jsonb,
 unique(repository_id,document_id,id),
 unique(repository_id,document_id,version,id),
 unique(document_id,version),
 foreign key(repository_id,document_id) references app_private.contract_documents(repository_id,id),
 foreign key(repository_id,document_id,parent_revision_id) references app_private.contract_document_revisions(repository_id,document_id,id),
 foreign key(repository_id,file_id,file_revision_id,file_sha256)
  references app_private.file_revisions(repository_id,file_id,id,sha256),
 check((version=1 and parent_revision_id is null) or (version>1 and parent_revision_id is not null)),
 check(state='DRAFT' or jsonb_array_length(diagnostics)=0 or coalesce(length(trim(acknowledgement_reason)),0)>0),
 check((state='DRAFT' and source_review_attestation is null) or
  (state='CONFIRMED' and jsonb_typeof(source_review_attestation)='object'))
);
alter table app_private.contract_documents add constraint contract_documents_head_fkey
 foreign key(repository_id,id,version,head_revision_id)
 references app_private.contract_document_revisions(repository_id,document_id,version,id)
 deferrable initially deferred;

create table app_private.contract_document_commands (
 actor_user_id text not null references app_private.users(id),
 request_id uuid not null,
 repository_id text not null,
 document_id uuid not null,
 revision_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 intent_fingerprint text not null check(intent_fingerprint ~ '^[0-9a-f]{64}$'),
 primary key(actor_user_id,request_id),
 foreign key(repository_id,document_id,revision_id)
  references app_private.contract_document_revisions(repository_id,document_id,id)
);
create index contract_document_revisions_source on app_private.contract_document_revisions(repository_id,file_id,file_revision_id);

alter table app_private.contract_documents enable row level security;
alter table app_private.contract_document_revisions enable row level security;
alter table app_private.contract_document_commands enable row level security;
revoke all on app_private.contract_documents,app_private.contract_document_revisions,app_private.contract_document_commands from public,anon,authenticated,line_app;
grant select,insert,update(version,head_revision_id) on app_private.contract_documents to line_app;
grant select,insert on app_private.contract_document_revisions,app_private.contract_document_commands to line_app;
create policy backend on app_private.contract_documents for all to line_app using(true) with check(true);
create policy backend_read on app_private.contract_document_revisions for select to line_app using(true);
create policy backend_insert on app_private.contract_document_revisions for insert to line_app with check(true);
create policy backend_read on app_private.contract_document_commands for select to line_app using(true);
create policy backend_insert on app_private.contract_document_commands for insert to line_app with check(true);
