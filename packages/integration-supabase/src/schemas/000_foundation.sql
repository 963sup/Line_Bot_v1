-- Application-owned private schema and runtime role foundation.
-- Keep the application namespace separate from provider-owned schemas.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'line_app') then
    create role line_app nologin;
  end if;
end $$;
grant line_app to postgres;
grant usage on schema app_private to line_app;

-- Shared transaction protocol for qualification/access readers and governance writers.
-- Acquire before User/resource row and request locks; PostgreSQL releases it at transaction end.
-- Business authorization and replay order remain with each calling Owner.
create or replace function app_private.lock_governance(p_mode text)
returns void
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
declare
  protocol_key constant bigint := 71020260912;
begin
  if p_mode = 'shared' then
    perform pg_catalog.pg_advisory_xact_lock_shared(protocol_key);
  elsif p_mode = 'exclusive' then
    perform pg_catalog.pg_advisory_xact_lock(protocol_key);
  else
    raise exception 'governance_lock_mode_invalid' using errcode = '22023';
  end if;
end
$function$;
revoke all on function app_private.lock_governance(text) from public, anon, authenticated, line_app;
grant execute on function app_private.lock_governance(text) to line_app;

-- Neutral deployment checkpoint for the one atomic transition from legacy projections to
-- Numbering and Namespace authority. This records deployment/recovery evidence only; it does
-- not own any business identifier or scope.
create table if not exists app_private.scoped_identifier_authority (
  authority text primary key,
  revision text not null,
  activated_at bigint not null,
  summary jsonb not null,
  runtime_ready boolean not null default false,
  runtime_revision text,
  runtime_activated_at bigint,
  constraint scoped_identifier_authority_name_check check (
    authority = 'scoped-identifiers-v1'
  ),
  constraint scoped_identifier_authority_revision_check check (
    revision ~ '^[0-9a-f]{40}$'
  ),
  constraint scoped_identifier_authority_time_check check (
    activated_at between 0 and 9007199254740991
  ),
  constraint scoped_identifier_runtime_check check (
    (not runtime_ready and runtime_revision is null and runtime_activated_at is null)
    or (runtime_ready and runtime_revision is not null
      and runtime_revision ~ '^[0-9a-f]{40}$'
      and runtime_activated_at is not null
      and runtime_activated_at between activated_at and 9007199254740991)
  ),
  constraint scoped_identifier_authority_summary_check check (
    jsonb_typeof(summary) = 'object'
    and summary ?& array[
      'numberSeries',
      'numberAllocations',
      'namespaceBindings',
      'namespaceClaims',
      'namespaceHistory'
    ]
    and summary->>'numberSeries' ~ '^(0|[1-9][0-9]*)$'
    and summary->>'numberAllocations' ~ '^(0|[1-9][0-9]*)$'
    and summary->>'namespaceBindings' ~ '^(0|[1-9][0-9]*)$'
    and summary->>'namespaceClaims' ~ '^(0|[1-9][0-9]*)$'
    and summary->>'namespaceHistory' ~ '^(0|[1-9][0-9]*)$'
  )
);
alter table app_private.scoped_identifier_authority enable row level security;
revoke all on app_private.scoped_identifier_authority
  from public, anon, authenticated, line_app;

create or replace function app_private.protect_scoped_identifier_authority()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op='DELETE'
     or new.authority is distinct from old.authority
     or new.revision is distinct from old.revision
     or new.activated_at is distinct from old.activated_at
     or new.summary is distinct from old.summary
     or old.runtime_ready
     or not new.runtime_ready then
    raise exception 'scoped_identifier_authority_immutable' using errcode='23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_scoped_identifier_authority()
  from public, anon, authenticated, line_app;
create or replace trigger scoped_identifier_authority_immutable
before update or delete on app_private.scoped_identifier_authority
for each row execute function app_private.protect_scoped_identifier_authority();
