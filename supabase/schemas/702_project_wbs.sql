-- Project-owned versioned Work Breakdown Structure.
create table app_private.project_wbs (
  project_id text primary key references app_private.projects(id),
  version integer not null check (version > 0),
  head_revision_id uuid not null
);
create table app_private.project_wbs_revisions (
  id uuid primary key,
  project_id text not null references app_private.project_wbs(project_id),
  version integer not null check (version > 0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  action text not null check (action in ('initialize','create-node','update-node','move-node','delete-subtree','import-contract')),
  -- Source IDs are WBS-owned import evidence; Contract retains agreement facts and permissions.
  contract_import jsonb,
  check (
    (action<>'import-contract' and contract_import is null)
    or (
      action='import-contract'
      and jsonb_typeof(contract_import)='object'
      and contract_import ?& array[
        'repositoryId','contractId','contractRevisionId','lineId',
        'planRevisionId','contentNodeId','nodeId'
      ]
      and length(contract_import->>'repositoryId') between 1 and 128
      and (contract_import->>'contractId') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(project_id,version),
  unique(project_id,id),
  unique(project_id,version,id),
  foreign key(project_id,parent_revision_id) references app_private.project_wbs_revisions(project_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.project_wbs add constraint project_wbs_head_fkey
  foreign key(project_id,version,head_revision_id) references app_private.project_wbs_revisions(project_id,version,id) deferrable initially deferred;
create table app_private.project_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  project_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(project_id,revision_id) references app_private.project_wbs_revisions(project_id,id)
);
create index project_wbs_commands_source on app_private.project_wbs_commands(project_id,revision_id);
alter table app_private.project_wbs enable row level security;
alter table app_private.project_wbs_revisions enable row level security;
alter table app_private.project_wbs_commands enable row level security;
revoke all on app_private.project_wbs, app_private.project_wbs_revisions, app_private.project_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.project_wbs to line_app;
grant select,insert on app_private.project_wbs_revisions, app_private.project_wbs_commands to line_app;
create policy backend on app_private.project_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.project_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_commands for insert to line_app with check(true);

      and (contract_import->>'contractRevisionId') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(project_id,version),
  unique(project_id,id),
  unique(project_id,version,id),
  foreign key(project_id,parent_revision_id) references app_private.project_wbs_revisions(project_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.project_wbs add constraint project_wbs_head_fkey
  foreign key(project_id,version,head_revision_id) references app_private.project_wbs_revisions(project_id,version,id) deferrable initially deferred;
create table app_private.project_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  project_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(project_id,revision_id) references app_private.project_wbs_revisions(project_id,id)
);
create index project_wbs_commands_source on app_private.project_wbs_commands(project_id,revision_id);
alter table app_private.project_wbs enable row level security;
alter table app_private.project_wbs_revisions enable row level security;
alter table app_private.project_wbs_commands enable row level security;
revoke all on app_private.project_wbs, app_private.project_wbs_revisions, app_private.project_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.project_wbs to line_app;
grant select,insert on app_private.project_wbs_revisions, app_private.project_wbs_commands to line_app;
create policy backend on app_private.project_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.project_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_commands for insert to line_app with check(true);

      and (contract_import->>'lineId') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(project_id,version),
  unique(project_id,id),
  unique(project_id,version,id),
  foreign key(project_id,parent_revision_id) references app_private.project_wbs_revisions(project_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.project_wbs add constraint project_wbs_head_fkey
  foreign key(project_id,version,head_revision_id) references app_private.project_wbs_revisions(project_id,version,id) deferrable initially deferred;
create table app_private.project_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  project_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(project_id,revision_id) references app_private.project_wbs_revisions(project_id,id)
);
create index project_wbs_commands_source on app_private.project_wbs_commands(project_id,revision_id);
alter table app_private.project_wbs enable row level security;
alter table app_private.project_wbs_revisions enable row level security;
alter table app_private.project_wbs_commands enable row level security;
revoke all on app_private.project_wbs, app_private.project_wbs_revisions, app_private.project_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.project_wbs to line_app;
grant select,insert on app_private.project_wbs_revisions, app_private.project_wbs_commands to line_app;
create policy backend on app_private.project_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.project_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_commands for insert to line_app with check(true);

      and (contract_import->>'planRevisionId') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(project_id,version),
  unique(project_id,id),
  unique(project_id,version,id),
  foreign key(project_id,parent_revision_id) references app_private.project_wbs_revisions(project_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.project_wbs add constraint project_wbs_head_fkey
  foreign key(project_id,version,head_revision_id) references app_private.project_wbs_revisions(project_id,version,id) deferrable initially deferred;
create table app_private.project_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  project_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(project_id,revision_id) references app_private.project_wbs_revisions(project_id,id)
);
create index project_wbs_commands_source on app_private.project_wbs_commands(project_id,revision_id);
alter table app_private.project_wbs enable row level security;
alter table app_private.project_wbs_revisions enable row level security;
alter table app_private.project_wbs_commands enable row level security;
revoke all on app_private.project_wbs, app_private.project_wbs_revisions, app_private.project_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.project_wbs to line_app;
grant select,insert on app_private.project_wbs_revisions, app_private.project_wbs_commands to line_app;
create policy backend on app_private.project_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.project_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_commands for insert to line_app with check(true);

    )
  ),
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(project_id,version),
  unique(project_id,id),
  unique(project_id,version,id),
  foreign key(project_id,parent_revision_id) references app_private.project_wbs_revisions(project_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.project_wbs add constraint project_wbs_head_fkey
  foreign key(project_id,version,head_revision_id) references app_private.project_wbs_revisions(project_id,version,id) deferrable initially deferred;
create table app_private.project_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  project_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(project_id,revision_id) references app_private.project_wbs_revisions(project_id,id)
);
create index project_wbs_commands_source on app_private.project_wbs_commands(project_id,revision_id);
alter table app_private.project_wbs enable row level security;
alter table app_private.project_wbs_revisions enable row level security;
alter table app_private.project_wbs_commands enable row level security;
revoke all on app_private.project_wbs, app_private.project_wbs_revisions, app_private.project_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.project_wbs to line_app;
grant select,insert on app_private.project_wbs_revisions, app_private.project_wbs_commands to line_app;
create policy backend on app_private.project_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.project_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_commands for insert to line_app with check(true);
