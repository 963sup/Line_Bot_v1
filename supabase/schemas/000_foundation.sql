-- Application-owned private schema and runtime role foundation.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'line_app') then
    create role line_app nologin;
  end if;
end $$;
grant line_app to postgres;
grant usage on schema app_private to line_app;
