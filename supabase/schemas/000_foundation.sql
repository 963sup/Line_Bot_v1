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
create function app_private.lock_governance(p_mode text)
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
