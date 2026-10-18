-- Object owns Repository-scoped classifications, native content revisions and directed structure.
create table app_private.object_types (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  name text not null check(name=btrim(name) and length(name) between 1 and 100),
  description text not null check(length(description)<=2000),
  enabled boolean not null,
  version integer not null check(version>0),
  created_at bigint not null,
  updated_at bigint not null check(updated_at>=created_at),
  unique(repository_id,id)
);
create unique index object_types_repository_name
  on app_private.object_types(repository_id,lower(name));
create index object_types_repository_enabled
  on app_private.object_types(repository_id,enabled,id);

create table app_private.objects (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  version integer not null check(version>0),
  head_revision_id uuid not null,
  unique(repository_id,id)
);
create table app_private.object_revisions (
  id uuid primary key,
  object_id uuid not null,
  repository_id text not null,
  version integer not null check(version>0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('create','edit','reclassify','archive','unarchive','restore')),
  type_id uuid not null,
  type_name text not null check(type_name=btrim(type_name) and length(type_name) between 1 and 100),
  name text not null check(name=btrim(name) and length(name) between 1 and 200),
  content text not null check(length(content)<=262144),
  archived boolean not null,
  unique(object_id,id),
  unique(repository_id,object_id,id),
  unique(repository_id,object_id,version,id),
  unique(object_id,version),
  foreign key(repository_id,object_id) references app_private.objects(repository_id,id),
  foreign key(repository_id,type_id) references app_private.object_types(repository_id,id),
  foreign key(repository_id,object_id,parent_revision_id)
    references app_private.object_revisions(repository_id,object_id,id),
  check(
    (version=1 and parent_revision_id is null and action='create')
    or (version>1 and parent_revision_id is not null and action<>'create')
  )
);
alter table app_private.objects add constraint objects_head_fkey
  foreign key(repository_id,id,version,head_revision_id)
  references app_private.object_revisions(repository_id,object_id,version,id)
  deferrable initially deferred;
create index objects_repository on app_private.objects(repository_id,id);
create index object_revisions_type on app_private.object_revisions(repository_id,type_id,object_id);

create table app_private.object_relationships (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  version integer not null check(version>0),
  head_revision_id uuid not null,
  source_object_id uuid not null,
  target_object_id uuid not null,
  name text not null check(name=btrim(name) and length(name) between 1 and 100),
  active boolean not null,
  unique(repository_id,id),
  foreign key(repository_id,source_object_id) references app_private.objects(repository_id,id),
  foreign key(repository_id,target_object_id) references app_private.objects(repository_id,id),
  check(source_object_id<>target_object_id)
);
create unique index object_relationships_live_edge
  on app_private.object_relationships(repository_id,source_object_id,lower(name),target_object_id)
  where active;
create index object_relationships_source
  on app_private.object_relationships(repository_id,source_object_id,id) where active;
create index object_relationships_target
  on app_private.object_relationships(repository_id,target_object_id,id) where active;

create table app_private.object_relationship_revisions (
  id uuid primary key,
  relationship_id uuid not null,
  repository_id text not null,
  version integer not null check(version>0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('create','rename','remove')),
  source_object_id uuid not null,
  target_object_id uuid not null,
  name text not null check(name=btrim(name) and length(name) between 1 and 100),
  active boolean not null,
  unique(repository_id,relationship_id,id),
  unique(repository_id,relationship_id,version,id,source_object_id,target_object_id,name,active),
  unique(relationship_id,version),
  foreign key(repository_id,relationship_id)
    references app_private.object_relationships(repository_id,id),
  foreign key(repository_id,source_object_id) references app_private.objects(repository_id,id),
  foreign key(repository_id,target_object_id) references app_private.objects(repository_id,id),
  foreign key(repository_id,relationship_id,parent_revision_id)
    references app_private.object_relationship_revisions(repository_id,relationship_id,id),
  check(source_object_id<>target_object_id),
  check(
    (version=1 and parent_revision_id is null and action='create' and active)
    or (version>1 and parent_revision_id is not null and action<>'create')
  ),
  check((action='remove' and not active) or (action<>'remove' and active))
);
alter table app_private.object_relationships add constraint object_relationships_head_fkey
  foreign key(
    repository_id,id,version,head_revision_id,
    source_object_id,target_object_id,name,active
  ) references app_private.object_relationship_revisions(
    repository_id,relationship_id,version,id,
    source_object_id,target_object_id,name,active
  ) deferrable initially deferred;

create table app_private.object_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null references app_private.repositories(id),
  fingerprint text not null check(length(fingerprint)=64),
  result jsonb not null check(jsonb_typeof(result)='object'),
  primary key(actor_user_id,request_id)
);

create function app_private.enforce_object_revision_type_state()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private','pg_catalog'
as $function$
begin
  if new.action in ('create','reclassify','restore') and not exists (
    select 1 from app_private.object_types t
    where t.repository_id=new.repository_id and t.id=new.type_id and t.enabled
    for key share
  ) then
    raise exception 'object_type_unavailable' using errcode='23514';
  end if;
  return new;
end
$function$;
create trigger object_revision_type_state_guard
before insert on app_private.object_revisions
for each row execute function app_private.enforce_object_revision_type_state();

alter table app_private.object_types enable row level security;
alter table app_private.objects enable row level security;
alter table app_private.object_revisions enable row level security;
alter table app_private.object_relationships enable row level security;
alter table app_private.object_relationship_revisions enable row level security;
alter table app_private.object_commands enable row level security;

revoke all on app_private.object_types,app_private.objects,app_private.object_revisions,
  app_private.object_relationships,app_private.object_relationship_revisions,
  app_private.object_commands from public,anon,authenticated,line_app;
grant select,insert,update on app_private.object_types,app_private.objects,
  app_private.object_relationships to line_app;
grant select,insert on app_private.object_revisions,
  app_private.object_relationship_revisions,app_private.object_commands to line_app;
revoke all on function app_private.enforce_object_revision_type_state()
  from public,anon,authenticated,line_app;
grant execute on function app_private.enforce_object_revision_type_state() to line_app;

create policy backend on app_private.object_types for all to line_app using(true) with check(true);
create policy backend on app_private.objects for all to line_app using(true) with check(true);
create policy backend_read on app_private.object_revisions for select to line_app using(true);
create policy backend_insert on app_private.object_revisions for insert to line_app with check(true);
create policy backend on app_private.object_relationships for all to line_app using(true) with check(true);
create policy backend_read on app_private.object_relationship_revisions for select to line_app using(true);
create policy backend_insert on app_private.object_relationship_revisions for insert to line_app with check(true);
create policy backend_read on app_private.object_commands for select to line_app using(true);
create policy backend_insert on app_private.object_commands for insert to line_app with check(true);
