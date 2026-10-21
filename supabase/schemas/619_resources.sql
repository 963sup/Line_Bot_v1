-- Resources owns Repository-scoped Location, Equipment and Material identity and lifecycle.
create table app_private.repository_resources (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  kind text not null check(kind in ('LOCATION','EQUIPMENT','MATERIAL')),
  version integer not null check(version>0),
  head_revision_id uuid not null,
  unique(repository_id,id),
  unique(repository_id,id,kind)
);

create table app_private.resource_revisions (
  id uuid primary key,
  resource_id uuid not null,
  repository_id text not null,
  version integer not null check(version>0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('create','edit','archive','unarchive')),
  kind text not null check(kind in ('LOCATION','EQUIPMENT','MATERIAL')),
  name text not null check(name=btrim(name) and length(name) between 1 and 200),
  description text not null check(length(description)<=262144),
  state text not null check(state in ('ACTIVE','ARCHIVED')),
  unique(repository_id,resource_id,id),
  unique(repository_id,resource_id,version,id,kind),
  unique(resource_id,version),
  foreign key(repository_id,resource_id,kind)
    references app_private.repository_resources(repository_id,id,kind),
  foreign key(repository_id,resource_id,parent_revision_id)
    references app_private.resource_revisions(repository_id,resource_id,id),
  check(
    (version=1 and parent_revision_id is null and action='create')
    or (version>1 and parent_revision_id is not null and action<>'create')
  ),
  check(
    (action in ('create','edit','unarchive') and state='ACTIVE')
    or (action='archive' and state='ARCHIVED')
  )
);

alter table app_private.repository_resources add constraint repository_resources_head_fkey
  foreign key(repository_id,id,version,head_revision_id,kind)
  references app_private.resource_revisions(repository_id,resource_id,version,id,kind)
  deferrable initially deferred;

create table app_private.resource_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  resource_id uuid not null,
  fingerprint text not null check(length(fingerprint)=64),
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,resource_id,revision_id)
    references app_private.resource_revisions(repository_id,resource_id,id)
);

create index repository_resources_repository
  on app_private.repository_resources(repository_id,id);

alter table app_private.repository_resources enable row level security;
alter table app_private.resource_revisions enable row level security;
alter table app_private.resource_commands enable row level security;

revoke all on app_private.repository_resources,
  app_private.resource_revisions,
  app_private.resource_commands
  from public,anon,authenticated,line_app;

grant select,insert,update(version,head_revision_id)
  on app_private.repository_resources to line_app;
grant select,insert on app_private.resource_revisions,
  app_private.resource_commands to line_app;

create policy backend on app_private.repository_resources
  for all to line_app using(true) with check(true);
create policy backend_read on app_private.resource_revisions
  for select to line_app using(true);
create policy backend_insert on app_private.resource_revisions
  for insert to line_app with check(true);
create policy backend_read on app_private.resource_commands
  for select to line_app using(true);
create policy backend_insert on app_private.resource_commands
  for insert to line_app with check(true);
