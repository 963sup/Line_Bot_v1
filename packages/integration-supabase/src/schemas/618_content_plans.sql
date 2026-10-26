-- Content owns one Repository plan head, complete immutable revisions, resource pins and receipts.
create table app_private.content_plans (
  repository_id text primary key references app_private.repositories(id),
  version integer not null check(version > 0),
  head_revision_id uuid not null,
  unique(repository_id,version,head_revision_id)
);

create table app_private.content_plan_revisions (
  id uuid primary key,
  repository_id text not null,
  version integer not null check(version > 0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('initialize','replace','import-file','import-contract-document')),
  document jsonb not null check(
    jsonb_typeof(document)='object'
    and document->>'schemaVersion'='1'
    and jsonb_typeof(document->'measures')='array'
    and jsonb_typeof(document->'nodes')='array'
    and jsonb_array_length(document->'measures')<=1000
    and jsonb_array_length(document->'nodes')<=1000
    and octet_length(document::text)<=4194304
  ),
  -- Immutable Content-owned evidence pin; File remains the source of exact observations.
  file_import jsonb,
  contract_document_import jsonb,
  check(
    (action<>'import-file' and file_import is null)
    or (action='import-file' and file_import is not null
      and jsonb_typeof(file_import)='object'
      and file_import ?& array[
        'repositoryId','fileId','fileRevisionId','fileSha256','runId',
        'processingRevisionId','observationId','uncertain','nodeId'
      ]
      and file_import->>'repositoryId'=repository_id
      and (file_import->>'fileSha256') ~ '^[0-9a-f]{64}$'
      and jsonb_typeof(file_import->'uncertain')='boolean'
    )
  ),
  check(
    (action<>'import-contract-document' and contract_document_import is null)
    or (action='import-contract-document' and contract_document_import is not null
      and jsonb_typeof(contract_document_import)='object'
      and contract_document_import ?& array['documentId','revisionId','fileId','fileRevisionId','fileSha256','mappingVersion','rows']
      and (contract_document_import->>'fileSha256') ~ '^[0-9a-f]{64}$'
      and contract_document_import->>'mappingVersion'='purchase-order-content-v1'
      and jsonb_typeof(contract_document_import->'rows')='array'
      and jsonb_array_length(contract_document_import->'rows') between 1 and 1000
      and jsonb_array_length(document->'nodes')>=2*(
        jsonb_array_length(jsonb_path_query_array(
          contract_document_import->'rows', '$[*] ? (@.disposition == "CONTENT_WORK")'
        ))
      ))
  ),
  unique(repository_id,id),
  unique(repository_id,version,id),
  unique(repository_id,version),
  foreign key(repository_id) references app_private.content_plans(repository_id),
  foreign key(repository_id,parent_revision_id)
    references app_private.content_plan_revisions(repository_id,id),
  check(
    (version=1 and parent_revision_id is null and action='initialize')
    or (version>1 and parent_revision_id is not null and action in ('replace','import-file','import-contract-document'))
  )
);

alter table app_private.content_plans add constraint content_plans_head_fkey
  foreign key(repository_id,version,head_revision_id)
  references app_private.content_plan_revisions(repository_id,version,id)
  deferrable initially deferred;

create table app_private.content_plan_resource_pins (
  repository_id text not null,
  plan_revision_id uuid not null,
  node_id uuid not null,
  resource_id uuid not null,
  resource_revision_id uuid not null,
  kind text not null check(kind in ('LOCATION','EQUIPMENT','MATERIAL')),
  primary key(repository_id,plan_revision_id,node_id,resource_id),
  foreign key(repository_id,plan_revision_id)
    references app_private.content_plan_revisions(repository_id,id)
);

create table app_private.content_plan_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,revision_id)
    references app_private.content_plan_revisions(repository_id,id)
);

create index content_plan_revisions_parent
  on app_private.content_plan_revisions(repository_id,parent_revision_id);
create index content_plan_resource_pins_resource
  on app_private.content_plan_resource_pins(repository_id,resource_id,resource_revision_id);
create index content_plan_commands_revision
  on app_private.content_plan_commands(repository_id,revision_id);

alter table app_private.content_plans enable row level security;
alter table app_private.content_plan_revisions enable row level security;
alter table app_private.content_plan_resource_pins enable row level security;
alter table app_private.content_plan_commands enable row level security;

revoke all on app_private.content_plans,
  app_private.content_plan_revisions,
  app_private.content_plan_resource_pins,
  app_private.content_plan_commands
  from public,anon,authenticated,line_app;

grant select,insert,update(version,head_revision_id) on app_private.content_plans to line_app;
grant select,insert on app_private.content_plan_revisions,
  app_private.content_plan_resource_pins,
  app_private.content_plan_commands to line_app;

create policy backend on app_private.content_plans
  for all to line_app using(true) with check(true);
create policy backend_read on app_private.content_plan_revisions
  for select to line_app using(true);
create policy backend_insert on app_private.content_plan_revisions
  for insert to line_app with check(true);
create policy backend_read on app_private.content_plan_resource_pins
  for select to line_app using(true);
create policy backend_insert on app_private.content_plan_resource_pins
  for insert to line_app with check(true);
create policy backend_read on app_private.content_plan_commands
  for select to line_app using(true);
create policy backend_insert on app_private.content_plan_commands
  for insert to line_app with check(true);
