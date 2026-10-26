-- Asset definition authority。依賴：foundation。
-- Current Asset set and denomination are schema-defined reference data; runtime is read-only.

create type app_private.asset_code as enum ('coin');

create view app_private.asset_definitions
with (security_invoker = true)
as
select
  'coin'::app_private.asset_code as code,
  'Coin'::text as display_name,
  2::integer as units_per_whole;

revoke all on app_private.asset_definitions from public, anon, authenticated, line_app;
grant select on app_private.asset_definitions to line_app;
