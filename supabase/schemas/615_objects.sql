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

-- Immutable semantic definition: equal units alone never make two quantities interchangeable.
create table app_private.object_measures (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  name text not null check(name=btrim(name) and length(name) between 1 and 100),
  subject text not null check(subject=btrim(subject) and length(subject) between 1 and 2000),
  unit text not null check(unit in ('m','pcs')),
  created_at bigint not null,
  unique(repository_id,id)
);
create index object_measures_repository on app_private.object_measures(repository_id,id);

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
  action text not null check(action in ('create','edit','reclassify','archive','unarchive','restore','set-quantity')),
  type_id uuid not null,
  type_name text not null check(type_name=btrim(type_name) and length(type_name) between 1 and 100),
  name text not null check(name=btrim(name) and length(name) between 1 and 200),
  content text not null check(length(content)<=262144),
  archived boolean not null,
  measure_id uuid,
  quantity_value numeric check(quantity_value>=0 and quantity_value<1000000000000000 and scale(quantity_value)<=3),
  quantity_purpose text check(quantity_purpose in ('REFERENCE','PLANNED')),
  source_object_id uuid,
  source_revision_id uuid,
  check(num_nonnulls(measure_id,quantity_value,quantity_purpose) in (0,3)),
  check(num_nonnulls(source_object_id,source_revision_id) in (0,2)),
  check(source_object_id is null or measure_id is not null),
  foreign key(repository_id,measure_id) references app_private.object_measures(repository_id,id),
  foreign key(repository_id,source_object_id,source_revision_id) references app_private.object_revisions(repository_id,object_id,id),
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
  kind text not null default 'REFERENCE' check(kind in ('REFERENCE','INCLUDES','ALLOCATES','LOCATED_IN')),
  unique(repository_id,id),
  foreign key(repository_id,source_object_id) references app_private.objects(repository_id,id),
  foreign key(repository_id,target_object_id) references app_private.objects(repository_id,id),
  check(source_object_id<>target_object_id)
);
create unique index object_relationships_live_edge
  on app_private.object_relationships(repository_id,source_object_id,lower(name),target_object_id)
  where active and kind='REFERENCE';
create unique index object_relationships_structural_parent
  on app_private.object_relationships(repository_id,target_object_id) where active and kind in ('INCLUDES','ALLOCATES');
create unique index object_relationships_direct_location
  on app_private.object_relationships(repository_id,source_object_id) where active and kind='LOCATED_IN';
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
  kind text not null default 'REFERENCE' check(kind in ('REFERENCE','INCLUDES','ALLOCATES','LOCATED_IN')),
  unique(repository_id,relationship_id,id),
  unique(repository_id,relationship_id,version,id,source_object_id,target_object_id,name,active,kind),
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
    source_object_id,target_object_id,name,active,kind
  ) references app_private.object_relationship_revisions(
    repository_id,relationship_id,version,id,
    source_object_id,target_object_id,name,active,kind
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
  if new.measure_id is not null and exists (
    select 1 from app_private.object_measures m where m.repository_id=new.repository_id and m.id=new.measure_id
    and m.unit='pcs' and scale(new.quantity_value)<>0
  ) then
    raise exception 'object_quantity_precision' using errcode='23514';
  end if;
  return new;
end
$function$;
create trigger object_revision_type_state_guard
before insert on app_private.object_revisions
for each row execute function app_private.enforce_object_revision_type_state();

-- Deferred validation permits a single atomic batch to transfer quantities between siblings.
-- The public Repository content transaction already serializes all participating writes.
create function app_private.enforce_object_engineering()
returns trigger language plpgsql security invoker
set search_path to 'app_private','pg_catalog'
as $function$
begin
  if exists (
    select 1 from app_private.object_relationships e
    join app_private.objects p on p.id=e.source_object_id
    join app_private.object_revisions pr on pr.id=p.head_revision_id
    join app_private.objects c on c.id=e.target_object_id
    join app_private.object_revisions cr on cr.id=c.head_revision_id
    where e.repository_id=new.repository_id and e.active and e.kind='ALLOCATES'
      and (pr.measure_id is null or cr.measure_id is null or pr.measure_id<>cr.measure_id or cr.quantity_purpose<>'PLANNED')
  ) or exists (
    select 1 from app_private.object_relationships e
    join app_private.objects p on p.id=e.source_object_id
    join app_private.object_revisions pr on pr.id=p.head_revision_id
    join app_private.objects c on c.id=e.target_object_id
    join app_private.object_revisions cr on cr.id=c.head_revision_id
    where e.repository_id=new.repository_id and e.active and e.kind='ALLOCATES'
    group by p.id,pr.quantity_value having sum(cr.quantity_value)>pr.quantity_value
  ) then
    raise exception 'object_allocation_invalid' using errcode='23514';
  end if;
  if exists (
    with recursive paths(source_id,target_id) as (
      select source_object_id,target_object_id from app_private.object_relationships
        where repository_id=new.repository_id and active and kind in ('INCLUDES','ALLOCATES')
      union
      select paths.source_id,e.target_object_id from paths join app_private.object_relationships e on e.source_object_id=paths.target_id
        where e.repository_id=new.repository_id and e.active and e.kind in ('INCLUDES','ALLOCATES')
    ) select 1 from paths where source_id=target_id
  ) then
    raise exception 'object_structure_cycle' using errcode='23514';
  end if;
  return new;
end
$function$;
create constraint trigger object_engineering_object_guard after insert or update on app_private.objects
  deferrable initially deferred for each row execute function app_private.enforce_object_engineering();
create constraint trigger object_engineering_relationship_guard after insert or update on app_private.object_relationships
  deferrable initially deferred for each row execute function app_private.enforce_object_engineering();

alter table app_private.object_measures enable row level security;
revoke all on app_private.object_measures from public,anon,authenticated,line_app;
grant select,insert on app_private.object_measures to line_app;
create policy backend_read on app_private.object_measures for select to line_app using(true);
create policy backend_insert on app_private.object_measures for insert to line_app with check(true);
revoke all on function app_private.enforce_object_engineering() from public,anon,authenticated,line_app;
grant execute on function app_private.enforce_object_engineering() to line_app;

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
