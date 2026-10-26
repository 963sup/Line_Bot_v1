-- Scoped sequential Series and immutable Allocation facts owned by Numbering.

create table app_private.number_series (
  family text not null,
  scope_kind text not null,
  scope_id text not null,
  next_number bigint not null,
  legacy_high_water bigint not null,
  managed_from bigint not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (family, scope_kind, scope_id),
  constraint number_series_scope_check check (
    (family in ('repository-work-item','repository-discussion','repository-milestone')
      and scope_kind='REPOSITORY')
    or (family='account-project' and scope_kind in ('USER','ORGANIZATION'))
    or (family='project-view' and scope_kind='PROJECT')
  ),
  constraint number_series_scope_id_check check (length(scope_id) > 0),
  constraint number_series_checkpoint_check check (
    legacy_high_water >= 0
    and managed_from = legacy_high_water + 1
    and next_number >= managed_from
    and (
      (family='project-view' and legacy_high_water <= 2147483647
        and next_number <= 2147483648)
      or (family<>'project-view' and legacy_high_water <= 9007199254740991
        and next_number <= 9007199254740992)
    )
  ),
  constraint number_series_time_check check (
    -- Explicit comparisons keep PostgreSQL CHECK deparse/reparse structurally stable.
    created_at >= 0 and created_at <= 9007199254740991
    and updated_at >= created_at and updated_at <= 9007199254740991
  )
);

create table app_private.number_allocations (
  family text not null,
  scope_kind text not null,
  scope_id text not null,
  number bigint not null,
  resource_kind text not null,
  resource_id text not null,
  provenance text not null,
  allocated_at bigint not null,
  primary key (family, scope_kind, scope_id, number),
  constraint number_allocations_resource_unique
    unique (family, scope_kind, scope_id, resource_kind, resource_id),
  constraint number_allocations_series_fkey
    foreign key (family, scope_kind, scope_id)
    references app_private.number_series(family, scope_kind, scope_id),
  constraint number_allocations_compatibility_check check (
    (family='repository-work-item' and scope_kind='REPOSITORY'
      and resource_kind in ('ISSUE','PULL_REQUEST'))
    or (family='repository-discussion' and scope_kind='REPOSITORY'
      and resource_kind='DISCUSSION')
    or (family='repository-milestone' and scope_kind='REPOSITORY'
      and resource_kind='MILESTONE')
    or (family='account-project' and scope_kind in ('USER','ORGANIZATION')
      and resource_kind='PROJECT')
    or (family='project-view' and scope_kind='PROJECT'
      and resource_kind='PROJECT_VIEW')
  ),
  constraint number_allocations_resource_id_check check (length(resource_id) > 0),
  constraint number_allocations_number_check check (
    (family='project-view' and number between 1 and 2147483647)
    or (family<>'project-view' and number between 1 and 9007199254740991)
  ),
  constraint number_allocations_provenance_check check (provenance in ('IMPORTED','MANAGED')),
  constraint number_allocations_allocated_at_check check (
    allocated_at between 0 and 9007199254740991
  )
);

alter table app_private.number_series enable row level security;
alter table app_private.number_allocations enable row level security;
revoke all on app_private.number_series from public, anon, authenticated, line_app;
revoke all on app_private.number_allocations from public, anon, authenticated, line_app;

create function app_private.protect_number_series()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE'
     or new.family is distinct from old.family
     or new.scope_kind is distinct from old.scope_kind
     or new.scope_id is distinct from old.scope_id
     or new.legacy_high_water is distinct from old.legacy_high_water
     or new.managed_from is distinct from old.managed_from
     or new.created_at is distinct from old.created_at
     or new.next_number <> old.next_number + 1
     or new.updated_at < old.updated_at
     or not exists (
       select 1 from app_private.number_allocations a
       where a.family=old.family
         and a.scope_kind=old.scope_kind
         and a.scope_id=old.scope_id
         and a.number=old.next_number
     ) then
    raise exception 'number_series_invalid_transition' using errcode = '23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_number_series()
  from public, anon, authenticated, line_app;
create trigger number_series_transition
before update or delete on app_private.number_series
for each row execute function app_private.protect_number_series();

create function app_private.protect_number_allocation()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  raise exception 'number_allocation_immutable' using errcode = '23514';
end
$function$;
revoke all on function app_private.protect_number_allocation()
  from public, anon, authenticated, line_app;
create trigger number_allocation_immutable
before update or delete on app_private.number_allocations
for each row execute function app_private.protect_number_allocation();

create function app_private.allocate_number(
  p_family text,
  p_scope_kind text,
  p_scope_id text,
  p_resource_kind text,
  p_resource_id text,
  p_at bigint
) returns bigint
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_series app_private.number_series%rowtype;
  existing_number bigint;
  maximum_number bigint;
begin
  if p_family is null or p_scope_kind is null or p_resource_kind is null
     or p_at is null or p_at not between 0 and 9007199254740991
     or p_scope_id is null or length(p_scope_id) = 0
     or p_resource_id is null or length(p_resource_id) = 0
     or not (
       (p_family='repository-work-item' and p_scope_kind='REPOSITORY'
         and p_resource_kind in ('ISSUE','PULL_REQUEST'))
       or (p_family='repository-discussion' and p_scope_kind='REPOSITORY'
         and p_resource_kind='DISCUSSION')
       or (p_family='repository-milestone' and p_scope_kind='REPOSITORY'
         and p_resource_kind='MILESTONE')
       or (p_family='account-project' and p_scope_kind in ('USER','ORGANIZATION')
         and p_resource_kind='PROJECT')
       or (p_family='project-view' and p_scope_kind='PROJECT'
         and p_resource_kind='PROJECT_VIEW')
     ) then
    raise exception 'number_allocation_invalid' using errcode = '22023';
  end if;

  insert into app_private.number_series(
    family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
  ) values (p_family,p_scope_kind,p_scope_id,1,0,1,p_at,p_at)
  on conflict (family,scope_kind,scope_id) do nothing;

  select * into strict current_series
  from app_private.number_series
  where family=p_family and scope_kind=p_scope_kind and scope_id=p_scope_id
  for update;

  select a.number into existing_number
  from app_private.number_allocations a
  where a.family=p_family
    and a.scope_kind=p_scope_kind
    and a.scope_id=p_scope_id
    and a.resource_kind=p_resource_kind
    and a.resource_id=p_resource_id;
  if found then
    return existing_number;
  end if;

  maximum_number := case when p_family='project-view' then 2147483647 else 9007199254740991 end;
  if current_series.next_number > maximum_number then
    raise exception 'number_series_exhausted' using errcode = '22003';
  end if;

  insert into app_private.number_allocations(
    family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
  ) values (
    p_family,p_scope_kind,p_scope_id,current_series.next_number,
    p_resource_kind,p_resource_id,'MANAGED',p_at
  );
  update app_private.number_series
  set next_number=current_series.next_number + 1,updated_at=greatest(updated_at,p_at)
  where family=p_family and scope_kind=p_scope_kind and scope_id=p_scope_id;
  return current_series.next_number;
end
$function$;
revoke all on function app_private.allocate_number(text,text,text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function app_private.allocate_number(text,text,text,text,text,bigint) to line_app;

create function app_private.resolve_number(
  p_family text,
  p_scope_kind text,
  p_scope_id text,
  p_number bigint
) returns table(resource_kind text, resource_id text, number bigint)
language sql
stable
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
  select a.resource_kind,a.resource_id,a.number
  from app_private.number_allocations a
  where a.family=p_family
    and a.scope_kind=p_scope_kind
    and a.scope_id=p_scope_id
    and a.number=p_number
$function$;
revoke all on function app_private.resolve_number(text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function app_private.resolve_number(text,text,text,bigint) to line_app;
