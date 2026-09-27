-- Only constraints/triggers that cannot be declared before all participating owners exist.

-- FK checks kind/existence; deferred checks prove the root has its required facet.
create function app_private.enforce_account_facet()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  identity_id text;
  identity_kind text;
  identity_created_at bigint;
begin
  identity_id := case when tg_op = 'DELETE'
    then coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'account_id')
    else coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'account_id')
  end;
  select kind, created_at into identity_kind, identity_created_at
    from app_private.accounts where id = identity_id;
  if not found then
    return null;
  end if;
  if identity_kind = 'USER' then
    if not exists (
      select 1 from app_private.users
      where id = identity_id and account_kind = identity_kind and "createdAt" = identity_created_at
    ) then
      raise exception 'account_facet_missing_or_mismatched' using errcode = '23514';
    end if;
  elsif identity_kind = 'ENTERPRISE' then
    if not exists (
      select 1 from app_private.enterprises
      where account_id = identity_id and account_kind = identity_kind
        and created_at = identity_created_at
    ) then
      raise exception 'account_facet_missing_or_mismatched' using errcode = '23514';
    end if;
  elsif identity_kind = 'ORGANIZATION' then
    if not exists (
      select 1 from app_private.organizations
      where account_id = identity_id and account_kind = identity_kind
        and created_at = identity_created_at
    ) then
      raise exception 'account_facet_missing_or_mismatched' using errcode = '23514';
    end if;
  end if;
  return null;
end
$function$;
revoke all on function app_private.enforce_account_facet() from public, anon, authenticated, line_app;
grant execute on function app_private.enforce_account_facet() to line_app;
create constraint trigger accounts_require_facet
  after insert or update or delete on app_private.accounts
  deferrable initially deferred for each row execute function app_private.enforce_account_facet();
create constraint trigger user_facet_complete
  after insert or update or delete on app_private.users
  deferrable initially deferred for each row execute function app_private.enforce_account_facet();

create function app_private.protect_governance_account_identity()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'governance_account_identity_immutable' using errcode = '23514';
  end if;
  if new.account_id is distinct from old.account_id
     or new.created_at is distinct from old.created_at then
    raise exception 'governance_account_identity_immutable' using errcode = '23514';
  end if;
  return new;
end
$function$;

create trigger enterprise_account_identity_immutable
before update or delete on app_private.enterprises
for each row execute function app_private.protect_governance_account_identity();

create trigger organization_account_identity_immutable
before update or delete on app_private.organizations
for each row execute function app_private.protect_governance_account_identity();


create constraint trigger enterprise_account_facet_complete
after insert or update or delete on app_private.enterprises
deferrable initially deferred for each row execute function app_private.enforce_account_facet();

create constraint trigger organization_account_facet_complete
after insert or update or delete on app_private.organizations
deferrable initially deferred for each row execute function app_private.enforce_account_facet();


-- Authorization owns the permission relation; Workplace owns its target relation.
alter table app_private.permission_grants
  add constraint "permission_grants_workplace_id_fkey"
  foreign key (workplace_id) references app_private.workplaces(id);


-- Enterprise owns attachment; Organization existence is a cross-owner invariant created after both roots exist.
alter table app_private.enterprise_organizations
  add constraint enterprise_organizations_organization_account_id_fkey
  foreign key (organization_account_id) references app_private.organizations(account_id);

-- ProjectItem may reference only a Repository explicitly attached to the same Project.
alter table app_private.project_items
  add constraint project_items_project_repository_fkey
  foreign key (project_id, repository_id)
  references app_private.project_repository_references(project_id, repository_id);


-- User lifecycle is Account authority; Identity/Access owns permission epochs.
-- A User status transition invalidates the prior permission snapshot without moving
-- either owner's authoritative state into the other relation.
create function app_private.protect_permission_administrator()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if old.status='active' and new.status<>'active' then
    perform pg_advisory_xact_lock(71020260912::bigint);
    if exists(
      select 1 from app_private.permission_administrators
      where user_id=old.id and user_version=old.status_version
    ) and not exists(
      select 1
      from app_private.permission_administrators a
      join app_private.users u on u.id=a.user_id
      where u.id<>old.id and u.status='active' and a.user_version=u.status_version
    ) then
      raise exception 'Cannot disable the last active permission administrator';
    end if;
  end if;
  if new.status is distinct from old.status then
    insert into app_private.permission_subject_versions(user_id,version)
      values(new.id,1)
    on conflict(user_id) do update
      set version=app_private.permission_subject_versions.version+1;
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_permission_administrator()
  from public, anon, authenticated, line_app;
grant execute on function app_private.protect_permission_administrator() to line_app;
create trigger permission_administrator_guard
before update on app_private.users
for each row execute function app_private.protect_permission_administrator();


-- Removing a PermissionAdministrator is Identity/Access mutation constrained by
-- current Account qualification.
create function app_private.protect_last_permission_administrator()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  perform pg_advisory_xact_lock(71020260912::bigint);
  if tg_op='UPDATE' and new.user_id=old.user_id and new.user_version=old.user_version then
    return new;
  end if;
  if exists(
    select 1 from app_private.users
    where id=old.user_id and status='active' and status_version=old.user_version
  ) and not exists(
    select 1
    from app_private.permission_administrators a
    join app_private.users u on u.id=a.user_id
    where a.user_id<>old.user_id and u.status='active' and a.user_version=u.status_version
  ) then
    raise exception 'Cannot remove the last active permission administrator';
  end if;
  if tg_op='UPDATE' then return new; end if;
  return old;
end
$function$;
revoke all on function app_private.protect_last_permission_administrator()
  from public, anon, authenticated, line_app;
create trigger last_permission_administrator
before delete or update on app_private.permission_administrators
for each row execute function app_private.protect_last_permission_administrator();


-- DailyCheckIn owns reward outcome; Ledger owns value fact. They must commit together.
create function app_private.enforce_daily_check_in_claim_ledger_parity()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if not exists (
    select 1
    from app_private.asset_ledger_entries l
    where l.member_id = new.user_id
      and l.asset_code = new.reward_asset_code
      and l.source_context = 'membership'
      and l.source_type = 'daily_checkin'
      and l.source_ref = new.business_day
      and l.business_day = new.business_day
      and l.amount_units = new.reward_amount_units
  ) then
    raise exception 'daily_check_in_claim_ledger_mismatch' using errcode = '23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.enforce_daily_check_in_claim_ledger_parity()
  from public, anon, authenticated, line_app;
grant execute on function app_private.enforce_daily_check_in_claim_ledger_parity() to line_app;
create constraint trigger daily_check_in_claim_requires_ledger
after insert on app_private.daily_check_in_claims
deferrable initially deferred for each row
execute function app_private.enforce_daily_check_in_claim_ledger_parity();
