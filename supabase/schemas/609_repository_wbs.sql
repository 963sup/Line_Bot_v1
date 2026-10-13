-- Repository-WBS content is separate from legacy Project-owned decomposition.
create table app_private.repository_wbs (
  repository_id text primary key references app_private.repositories(id),
  version integer not null check (version > 0),
  head_revision_id uuid not null
);
create table app_private.repository_wbs_revisions (
  id uuid primary key,
  repository_id text not null references app_private.repository_wbs(repository_id),
  version integer not null check (version > 0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  action text not null check (action in ('initialize','create-node','update-node','move-node','delete-subtree')),
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(repository_id,version),
  unique(repository_id,id),
  unique(repository_id,version,id),
  foreign key(repository_id,parent_revision_id) references app_private.repository_wbs_revisions(repository_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.repository_wbs add constraint repository_wbs_head_fkey
  foreign key(repository_id,version,head_revision_id) references app_private.repository_wbs_revisions(repository_id,version,id) deferrable initially deferred;
create table app_private.repository_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,revision_id) references app_private.repository_wbs_revisions(repository_id,id)
);
create index repository_wbs_commands_source on app_private.repository_wbs_commands(repository_id,revision_id);
alter table app_private.repository_wbs enable row level security;
alter table app_private.repository_wbs_revisions enable row level security;
alter table app_private.repository_wbs_commands enable row level security;
revoke all on app_private.repository_wbs, app_private.repository_wbs_revisions, app_private.repository_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.repository_wbs to line_app;
grant select,insert on app_private.repository_wbs_revisions, app_private.repository_wbs_commands to line_app;
create policy backend on app_private.repository_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.repository_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.repository_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_commands for insert to line_app with check(true);
