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

-- Account User lifecycle and the global Namespace binding commit together.
-- The deferred check permits either creation order while preventing removal or reassignment.
create function app_private.enforce_user_login()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  identity_id text;
  identity_ids text[] := array[]::text[];
begin
  if tg_table_name = 'users' then
    if tg_op <> 'INSERT' then
      identity_ids := array_append(identity_ids, old.id);
    end if;
    if tg_op <> 'DELETE' then
      identity_ids := array_append(identity_ids, new.id);
    end if;
  else
    if tg_op <> 'INSERT' and old.account_kind = 'USER' then
      identity_ids := array_append(identity_ids, old.account_id);
    end if;
    if tg_op <> 'DELETE' and new.account_kind = 'USER' then
      identity_ids := array_append(identity_ids, new.account_id);
    end if;
  end if;

  foreach identity_id in array identity_ids loop
    if exists (select 1 from app_private.users where id = identity_id)
       and not exists (
         select 1 from app_private.account_logins
         where account_id = identity_id and account_kind = 'USER'
       ) then
      raise exception 'user_login_missing' using errcode = '23514';
    end if;
  end loop;
  return null;
end
$function$;
revoke all on function app_private.enforce_user_login() from public, anon, authenticated, line_app;
grant execute on function app_private.enforce_user_login() to line_app;
create constraint trigger user_login_complete
after insert or update or delete on app_private.users
deferrable initially deferred for each row execute function app_private.enforce_user_login();
create constraint trigger account_login_user_complete
after insert or update or delete on app_private.account_logins
deferrable initially deferred for each row execute function app_private.enforce_user_login();

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


-- Repository-backed Notification sources must be readable by the recipient at creation time.
-- Inbox reads recheck the same projection, so later visibility/access changes also fail closed.
create function app_private.enforce_notification_source_access()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if new.source_type in ('issue','discussion')
     and not exists (
       select 1
       from app_private.notification_repository_source_access access
       where access.source_type=new.source_type
         and access.source_id=new.source_id
         and (access.user_id=new.recipient or access.user_id is null)
     ) then
    raise exception 'notification_source_access_forbidden' using errcode = '42501';
  end if;
  return new;
end
$function$;
revoke all on function app_private.enforce_notification_source_access()
  from public, anon, authenticated, line_app;
grant execute on function app_private.enforce_notification_source_access() to line_app;
create trigger notification_source_access_guard
before insert on app_private.notifications
for each row execute function app_private.enforce_notification_source_access();

-- IssueType is Organization-scoped, while Repository ownership remains Repository authority.
-- An Issue may reference only a type scoped to the Organization that owns its Repository.
create function app_private.enforce_issue_type_repository_scope()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if not exists (
    select 1
    from app_private.issues i
    join app_private.repositories r on r.id=i.repository_id
    join app_private.issue_types t on t.id=new.issue_type_id
    where i.id=new.issue_id
      and r.owner_account_kind='ORGANIZATION'
      and r.owner_account_id=t.organization_account_id
  ) then
    raise exception 'issue_type_repository_scope_mismatch' using errcode='23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.enforce_issue_type_repository_scope()
  from public, anon, authenticated, line_app;
grant execute on function app_private.enforce_issue_type_repository_scope() to line_app;
create trigger issue_type_assignment_repository_scope_guard
before insert or update on app_private.issue_type_assignments
for each row execute function app_private.enforce_issue_type_repository_scope();
