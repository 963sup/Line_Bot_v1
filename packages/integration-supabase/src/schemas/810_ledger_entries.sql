-- Ledger 是 append-only Asset value facts；Wallet balance 只由此投影。
-- 來源 module 決定 reward eligibility / amount；此層只驗證 posting contract、denomination 與 idempotency。

create table app_private."asset_ledger_entries" (
  "member_id" text not null,
  "asset_code" app_private.asset_code not null,
  "source_context" text not null,
  "source_type" text not null,
  "source_ref" text not null,
  "business_day" text,
  "amount_units" integer not null,
  "at" bigint not null,
  constraint "asset_ledger_entries_pkey" primary key (member_id, asset_code, source_context, source_type, source_ref),
  constraint "asset_ledger_entries_member_id_fkey" foreign key (member_id) references app_private.users(id),
  constraint "asset_ledger_entries_source_ref_check" check (((length(source_ref) >= 1) and (length(source_ref) <= 128))),
  constraint "asset_ledger_entries_source_check" check (((source_context = 'membership'::text and source_type = 'daily_checkin'::text) or (source_context = 'attendance'::text and source_type = any (array['clockIn'::text, 'clockOut'::text])) or (source_context = 'migration'::text and source_type = 'legacy_balance'::text))),
  constraint "asset_ledger_entries_business_day_check" check ((business_day is null or business_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text)),
  constraint "asset_ledger_entries_amount_units_check" check ((amount_units > 0)),
  constraint "asset_ledger_entries_at_check" check ((at >= 0))
);
alter table app_private."asset_ledger_entries" enable row level security;
revoke all on app_private."asset_ledger_entries" from public, anon, authenticated, line_app;
grant select on app_private."asset_ledger_entries" to line_app;
create policy "backend_read" on app_private."asset_ledger_entries" as permissive for select to "line_app" using (true);

create or replace function app_private.post_asset_credit(
  p_member_id text,
  p_asset_code text,
  p_source_context text,
  p_source_type text,
  p_source_ref text,
  p_business_day text,
  p_amount numeric,
  p_at bigint
)
returns boolean
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_units_per_whole integer;
  v_scaled numeric;
  v_amount_units integer;
  v_inserted integer;
begin
  if p_member_id is null or p_asset_code is null or p_source_ref is null or
     length(p_source_ref) < 1 or length(p_source_ref) > 128 or
     p_at is null or p_at < 0 or p_amount is null or p_amount <= 0 then
    raise exception 'invalid asset credit';
  end if;
  if not (
    (p_source_context = 'membership' and p_source_type = 'daily_checkin') or
    (p_source_context = 'attendance' and p_source_type in ('clockIn','clockOut'))
  ) then
    raise exception 'unsupported asset credit source';
  end if;
  if p_business_day is null or p_business_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_source_ref <> p_business_day then
    raise exception 'invalid asset credit reference';
  end if;

  select units_per_whole into v_units_per_whole
  from app_private.asset_definitions
  where code::text = p_asset_code;
  if v_units_per_whole is null then
    raise exception 'unsupported asset';
  end if;

  v_scaled := p_amount * v_units_per_whole;
  if v_scaled <> trunc(v_scaled) or v_scaled < 1 or v_scaled > 2147483647 then
    raise exception 'invalid asset denomination';
  end if;
  v_amount_units := v_scaled::integer;

  insert into app_private.asset_ledger_entries(
    member_id,asset_code,source_context,source_type,source_ref,business_day,amount_units,at
  ) values (
    p_member_id,p_asset_code::app_private.asset_code,p_source_context,p_source_type,p_source_ref,p_business_day,v_amount_units,p_at
  )
  on conflict (member_id,asset_code,source_context,source_type,source_ref) do nothing
  returning 1 into v_inserted;

  return v_inserted is not null;
end
$function$;
revoke all on function app_private.post_asset_credit(text,text,text,text,text,text,numeric,bigint) from public, anon, authenticated, line_app;
grant execute on function app_private.post_asset_credit(text,text,text,text,text,text,numeric,bigint) to line_app;
