-- Only constraints/triggers that cannot be declared before all participating owners exist.

-- Persist the maintenance fence across the database COMMIT and production deployment.
-- SECURITY DEFINER changes current_user, while the original SET ROLE remains observable.
-- The operator can import projections; runtime writers resume only after exact deployment readback.
create function app_private.enforce_scoped_identifier_runtime_ready()
returns trigger
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if current_setting('role',true)='line_app' and exists(
    select 1 from app_private.scoped_identifier_authority
    where authority='scoped-identifiers-v1' and not runtime_ready
  ) then
    raise exception 'scoped_identifier_writes_frozen_until_runtime_ready' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$function$;
revoke all on function app_private.enforce_scoped_identifier_runtime_ready()
  from public, anon, authenticated, line_app;

do $identifier_runtime_fence$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'account_logins','discussion_categories','discussions','enterprise_teams','enterprises',
    'issue_types','issues','project_field_options','project_fields','project_views','projects',
    'repositories','repository_labels','repository_milestones','repository_name_history','teams'
  ] loop
    execute format(
      'create trigger scoped_identifier_runtime_ready before insert or update or delete on app_private.%I for each row execute function app_private.enforce_scoped_identifier_runtime_ready()',
      relation_name
    );
  end loop;
end
$identifier_runtime_fence$;

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
    perform app_private.lock_governance('exclusive');
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
  perform app_private.lock_governance('exclusive');
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
  if new.source_type in ('issue','discussion','wbs-baseline','project-wbs-baseline') then
    perform app_private.lock_governance('shared');
  end if;

  if new.source_type in ('issue','discussion','wbs-baseline')
     and not exists (
       select 1
       from app_private.notification_repository_source_access access
       where access.source_type=new.source_type
         and access.source_id=new.source_id
         and (new.source_type<>'wbs-baseline' or access.source_version=new.source_version)
         and (access.user_id=new.recipient or access.user_id is null)
     ) then
    raise exception 'notification_source_access_forbidden' using errcode = '42501';
  end if;

  if new.source_type='project-wbs-baseline'
     and not exists (
       select 1
       from app_private.notification_project_source_access access
       where access.source_type=new.source_type
         and access.source_id=new.source_id
         and access.source_version=new.source_version
         and access.user_id=new.recipient
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


-- Numbering owns immutable Allocation facts while resource Owners retain their number columns.
-- Deferred, bidirectional parity permits either write order inside one transaction and rejects
-- direct legacy MAX+1 writes once these constraints are installed.
create function app_private.number_projection_exists(
  p_family text,
  p_scope_kind text,
  p_scope_id text,
  p_resource_kind text,
  p_resource_id text,
  p_number bigint
) returns boolean
language plpgsql
stable
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if p_family='repository-work-item' and p_scope_kind='REPOSITORY'
     and p_resource_kind='ISSUE' then
    return exists(
      select 1 from app_private.issues
      where id=p_resource_id and repository_id=p_scope_id and number=p_number
    );
  elsif p_family='repository-discussion' and p_scope_kind='REPOSITORY'
     and p_resource_kind='DISCUSSION' then
    return exists(
      select 1 from app_private.discussions
      where id=p_resource_id and repository_id=p_scope_id and number=p_number
    );
  elsif p_family='repository-milestone' and p_scope_kind='REPOSITORY'
     and p_resource_kind='MILESTONE' then
    return exists(
      select 1 from app_private.repository_milestones
      where id=p_resource_id and repository_id=p_scope_id and number=p_number
    );
  elsif p_family='account-project' and p_scope_kind in ('USER','ORGANIZATION')
     and p_resource_kind='PROJECT' then
    return exists(
      select 1 from app_private.projects
      where id=p_resource_id and owner_account_id=p_scope_id
        and owner_account_kind=p_scope_kind and number=p_number
    );
  elsif p_family='project-view' and p_scope_kind='PROJECT'
     and p_resource_kind='PROJECT_VIEW' then
    return exists(
      select 1 from app_private.project_views
      where id=p_resource_id and project_id=p_scope_id and number=p_number
    );
  end if;
  return false;
end
$function$;
revoke all on function app_private.number_projection_exists(text,text,text,text,text,bigint)
  from public, anon, authenticated, line_app;

create function app_private.enforce_number_allocation_projection()
returns trigger
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  row_data jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if not app_private.number_projection_exists(
    row_data->>'family',
    row_data->>'scope_kind',
    row_data->>'scope_id',
    row_data->>'resource_kind',
    row_data->>'resource_id',
    (row_data->>'number')::bigint
  ) then
    raise exception 'number_allocation_projection_mismatch' using errcode='23514';
  end if;
  return null;
end
$function$;
revoke all on function app_private.enforce_number_allocation_projection()
  from public, anon, authenticated, line_app;
create constraint trigger number_allocation_projection_complete
after insert or update or delete on app_private.number_allocations
deferrable initially deferred for each row
execute function app_private.enforce_number_allocation_projection();

create function app_private.enforce_resource_number_projection()
returns trigger
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  row_data jsonb;
  affected_id text := case when tg_op='DELETE' then old.id else new.id end;
  family_value text;
  scope_kind_value text;
  scope_id_value text;
  resource_kind_value text;
  resource_id_value text;
  number_value bigint;
begin
  execute format('select to_jsonb(resource) from app_private.%I resource where id=$1',tg_table_name)
    into row_data using affected_id;
  if row_data is null then return null; end if;
  resource_id_value := row_data->>'id';
  if row_data->>'number' is not null then
    number_value := (row_data->>'number')::bigint;
  end if;
  if tg_table_name='issues' then
    family_value := 'repository-work-item';
    scope_kind_value := 'REPOSITORY';
    scope_id_value := row_data->>'repository_id';
    resource_kind_value := 'ISSUE';
  elsif tg_table_name='discussions' then
    family_value := 'repository-discussion';
    scope_kind_value := 'REPOSITORY';
    scope_id_value := row_data->>'repository_id';
    resource_kind_value := 'DISCUSSION';
  elsif tg_table_name='repository_milestones' then
    family_value := 'repository-milestone';
    scope_kind_value := 'REPOSITORY';
    scope_id_value := row_data->>'repository_id';
    resource_kind_value := 'MILESTONE';
  elsif tg_table_name='projects' then
    family_value := 'account-project';
    scope_kind_value := row_data->>'owner_account_kind';
    scope_id_value := row_data->>'owner_account_id';
    resource_kind_value := 'PROJECT';
  elsif tg_table_name='project_views' then
    family_value := 'project-view';
    scope_kind_value := 'PROJECT';
    scope_id_value := row_data->>'project_id';
    resource_kind_value := 'PROJECT_VIEW';
  else
    raise exception 'number_projection_source_invalid' using errcode='22023';
  end if;

  if number_value is null then
    if exists(
      select 1 from app_private.number_allocations a
      where a.family=family_value and a.scope_kind=scope_kind_value
        and a.scope_id=scope_id_value and a.resource_kind=resource_kind_value
        and a.resource_id=resource_id_value
    ) then
      raise exception 'resource_number_projection_mismatch' using errcode='23514';
    end if;
    return null;
  end if;
  if not exists(
    select 1 from app_private.number_allocations a
    where a.family=family_value and a.scope_kind=scope_kind_value
      and a.scope_id=scope_id_value and a.resource_kind=resource_kind_value
      and a.resource_id=resource_id_value and a.number=number_value
  ) then
    raise exception 'resource_number_projection_mismatch' using errcode='23514';
  end if;
  return null;
end
$function$;
revoke all on function app_private.enforce_resource_number_projection()
  from public, anon, authenticated, line_app;

create constraint trigger issue_number_projection_complete
after insert or update or delete on app_private.issues
deferrable initially deferred for each row execute function app_private.enforce_resource_number_projection();
create constraint trigger discussion_number_projection_complete
after insert or update or delete on app_private.discussions
deferrable initially deferred for each row execute function app_private.enforce_resource_number_projection();
create constraint trigger repository_milestone_number_projection_complete
after insert or update or delete on app_private.repository_milestones
deferrable initially deferred for each row execute function app_private.enforce_resource_number_projection();
create constraint trigger project_number_projection_complete
after insert or update or delete on app_private.projects
deferrable initially deferred for each row execute function app_private.enforce_resource_number_projection();
create constraint trigger project_view_number_projection_complete
after insert or update or delete on app_private.project_views
deferrable initially deferred for each row execute function app_private.enforce_resource_number_projection();


-- Namespace owns scoped occupancy while each resource Owner retains its current name/slug.
-- These checks constrain both sides of that projection, including releasable names and the
-- Repository old-name alias source.
create function app_private.namespace_binding_projection_valid(
  p_family text,
  p_scope_kind text,
  p_scope_id text,
  p_target_kind text,
  p_target_id text,
  p_current_name text,
  p_canonical_key text
) returns boolean
language plpgsql
stable
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  resource_name text;
  resource_active boolean := false;
begin
  if p_family='account-login' and p_scope_kind='GLOBAL' and p_scope_id='global'
     and p_target_kind in ('USER','ORGANIZATION') then
    select login,true into resource_name,resource_active
      from app_private.account_logins
      where account_id=p_target_id and account_kind=p_target_kind;
  elsif p_family='enterprise-slug' and p_scope_kind='GLOBAL' and p_scope_id='global'
     and p_target_kind='ENTERPRISE' then
    select slug,(slug is not null) into resource_name,resource_active
      from app_private.enterprises where account_id=p_target_id;
  elsif p_family='repository-name' and p_scope_kind='OWNER_ACCOUNT'
     and p_target_kind='REPOSITORY' then
    select name,true into resource_name,resource_active
      from app_private.repositories
      where id=p_target_id and owner_account_id=p_scope_id;
  elsif p_family='organization-team-slug' and p_scope_kind='ORGANIZATION'
     and p_target_kind='TEAM' then
    select slug,true into resource_name,resource_active
      from app_private.teams
      where id=p_target_id and organization_account_id=p_scope_id;
  elsif p_family='enterprise-team-slug' and p_scope_kind='ENTERPRISE'
     and p_target_kind='ENTERPRISE_TEAM' then
    select slug,true into resource_name,resource_active
      from app_private.enterprise_teams
      where id=p_target_id and enterprise_account_id=p_scope_id;
  elsif p_family='repository-label' and p_scope_kind='REPOSITORY'
     and p_target_kind='LABEL' then
    select name,true into resource_name,resource_active
      from app_private.repository_labels
      where id=p_target_id and repository_id=p_scope_id;
  elsif p_family='organization-issue-type' and p_scope_kind='ORGANIZATION'
     and p_target_kind='ISSUE_TYPE' then
    select name,(deleted_at is null) into resource_name,resource_active
      from app_private.issue_types
      where id=p_target_id and organization_account_id=p_scope_id;
  elsif p_family='discussion-category' and p_scope_kind='REPOSITORY'
     and p_target_kind='DISCUSSION_CATEGORY' then
    select slug,true into resource_name,resource_active
      from app_private.discussion_categories
      where id=p_target_id and repository_id=p_scope_id;
  elsif p_family='project-field' and p_scope_kind='PROJECT'
     and p_target_kind='PROJECT_FIELD' then
    select name,true into resource_name,resource_active
      from app_private.project_fields
      where id=p_target_id and project_id=p_scope_id;
  elsif p_family='field-option' and p_scope_kind='PROJECT_FIELD'
     and p_target_kind='FIELD_OPTION' then
    select name,true into resource_name,resource_active
      from app_private.project_field_options
      where id=p_target_id and field_id=p_scope_id;
  elsif p_family='project-view' and p_scope_kind='PROJECT'
     and p_target_kind='PROJECT_VIEW' then
    select name,true into resource_name,resource_active
      from app_private.project_views
      where id=p_target_id and project_id=p_scope_id;
  else
    return false;
  end if;

  if not found then
    resource_active := false;
  end if;
  if not resource_active then
    return p_current_name is null and p_canonical_key is null
      and not exists(
        select 1 from app_private.namespace_claims c
        where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
          and c.target_kind=p_target_kind and c.target_id=p_target_id
          and c.claim_kind='CURRENT'
      );
  end if;
  return coalesce(p_current_name=resource_name
    and p_canonical_key=(
      select canonical_key
      from app_private.namespace_name_profile(
        p_family,p_scope_kind,p_scope_id,p_target_kind,resource_name
      )
    )
    and exists(
      select 1 from app_private.namespace_claims c
      where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
        and c.target_kind=p_target_kind and c.target_id=p_target_id
        and c.claim_kind='CURRENT' and c.name=resource_name
        and c.canonical_key=p_canonical_key
    ),false);
end
$function$;
revoke all on function app_private.namespace_binding_projection_valid(text,text,text,text,text,text,text)
  from public, anon, authenticated, line_app;

create function app_private.repository_alias_projection_valid(
  p_scope_id text,
  p_target_id text,
  p_canonical_key text
) returns boolean
language sql
stable
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
  select
    not exists(
      select 1
      from app_private.repository_name_history h
      join app_private.repositories r on r.id=h.repository_id
      where r.owner_account_id=p_scope_id and h.repository_id=p_target_id
        and lower(h.old_name)=p_canonical_key
    )
    or exists(
      select 1 from app_private.namespace_claims c
      where c.family='repository-name' and c.scope_kind='OWNER_ACCOUNT'
        and c.scope_id=p_scope_id and c.target_kind='REPOSITORY'
        and c.target_id=p_target_id and c.canonical_key=p_canonical_key
        and c.claim_kind in ('CURRENT','ALIAS')
    )
$function$;
revoke all on function app_private.repository_alias_projection_valid(text,text,text)
  from public, anon, authenticated, line_app;

create function app_private.enforce_namespace_registry_projection()
returns trigger
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  affected jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  binding app_private.namespace_bindings%rowtype;
begin
  select * into binding from app_private.namespace_bindings b
    where b.family=affected->>'family' and b.scope_kind=affected->>'scope_kind'
      and b.scope_id=affected->>'scope_id' and b.target_kind=affected->>'target_kind'
      and b.target_id=affected->>'target_id';
  if found and app_private.namespace_binding_projection_valid(
    binding.family,binding.scope_kind,binding.scope_id,binding.target_kind,binding.target_id,
    binding.current_name,binding.canonical_key
  ) is not true then
    raise exception 'namespace_binding_projection_mismatch' using errcode='23514';
  end if;
  if not found and tg_table_name='namespace_bindings'
     and (tg_op<>'DELETE' or affected->>'current_name' is not null) then
    raise exception 'namespace_binding_projection_mismatch' using errcode='23514';
  end if;

  if tg_table_name='namespace_claims' and affected->>'claim_kind'='ALIAS' then
    if affected->>'family'<>'repository-name'
       or not exists(
         select 1
         from app_private.repository_name_history h
         join app_private.repositories r on r.id=h.repository_id
         where r.owner_account_id=affected->>'scope_id'
           and h.repository_id=affected->>'target_id'
           and lower(h.old_name)=affected->>'canonical_key'
       ) then
      raise exception 'namespace_alias_projection_mismatch' using errcode='23514';
    end if;
  end if;
  if affected->>'family'='repository-name'
     and not app_private.repository_alias_projection_valid(
       affected->>'scope_id',affected->>'target_id',affected->>'canonical_key'
     ) then
    raise exception 'repository_alias_projection_mismatch' using errcode='23514';
  end if;
  return null;
end
$function$;
revoke all on function app_private.enforce_namespace_registry_projection()
  from public, anon, authenticated, line_app;
create constraint trigger namespace_binding_projection_complete
after insert or update or delete on app_private.namespace_bindings
deferrable initially deferred for each row
execute function app_private.enforce_namespace_registry_projection();
create constraint trigger namespace_claim_projection_complete
after insert or update or delete on app_private.namespace_claims
deferrable initially deferred for each row
execute function app_private.enforce_namespace_registry_projection();

create function app_private.enforce_resource_namespace_projection()
returns trigger
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  row_data jsonb;
  family_value text;
  scope_kind_value text;
  scope_id_value text;
  target_kind_value text;
  target_id_value text;
  binding app_private.namespace_bindings%rowtype;
begin
  foreach row_data in array case
    when tg_op='INSERT' then array[to_jsonb(new)]
    when tg_op='DELETE' then array[to_jsonb(old)]
    else array[to_jsonb(old),to_jsonb(new)]
  end loop
  if tg_table_name='account_logins' then
    family_value := 'account-login'; scope_kind_value := 'GLOBAL'; scope_id_value := 'global';
    target_kind_value := row_data->>'account_kind'; target_id_value := row_data->>'account_id';
  elsif tg_table_name='enterprises' then
    family_value := 'enterprise-slug'; scope_kind_value := 'GLOBAL'; scope_id_value := 'global';
    target_kind_value := 'ENTERPRISE'; target_id_value := row_data->>'account_id';
  elsif tg_table_name='repositories' then
    family_value := 'repository-name'; scope_kind_value := 'OWNER_ACCOUNT';
    scope_id_value := row_data->>'owner_account_id'; target_kind_value := 'REPOSITORY';
    target_id_value := row_data->>'id';
  elsif tg_table_name='teams' then
    family_value := 'organization-team-slug'; scope_kind_value := 'ORGANIZATION';
    scope_id_value := row_data->>'organization_account_id'; target_kind_value := 'TEAM';
    target_id_value := row_data->>'id';
  elsif tg_table_name='enterprise_teams' then
    family_value := 'enterprise-team-slug'; scope_kind_value := 'ENTERPRISE';
    scope_id_value := row_data->>'enterprise_account_id'; target_kind_value := 'ENTERPRISE_TEAM';
    target_id_value := row_data->>'id';
  elsif tg_table_name='repository_labels' then
    family_value := 'repository-label'; scope_kind_value := 'REPOSITORY';
    scope_id_value := row_data->>'repository_id'; target_kind_value := 'LABEL';
    target_id_value := row_data->>'id';
  elsif tg_table_name='issue_types' then
    family_value := 'organization-issue-type'; scope_kind_value := 'ORGANIZATION';
    scope_id_value := row_data->>'organization_account_id'; target_kind_value := 'ISSUE_TYPE';
    target_id_value := row_data->>'id';
  elsif tg_table_name='discussion_categories' then
    family_value := 'discussion-category'; scope_kind_value := 'REPOSITORY';
    scope_id_value := row_data->>'repository_id'; target_kind_value := 'DISCUSSION_CATEGORY';
    target_id_value := row_data->>'id';
  elsif tg_table_name='project_fields' then
    family_value := 'project-field'; scope_kind_value := 'PROJECT';
    scope_id_value := row_data->>'project_id'; target_kind_value := 'PROJECT_FIELD';
    target_id_value := row_data->>'id';
  elsif tg_table_name='project_field_options' then
    family_value := 'field-option'; scope_kind_value := 'PROJECT_FIELD';
    scope_id_value := row_data->>'field_id'; target_kind_value := 'FIELD_OPTION';
    target_id_value := row_data->>'id';
  elsif tg_table_name='project_views' then
    family_value := 'project-view'; scope_kind_value := 'PROJECT';
    scope_id_value := row_data->>'project_id'; target_kind_value := 'PROJECT_VIEW';
    target_id_value := row_data->>'id';
  else
    raise exception 'namespace_projection_source_invalid' using errcode='22023';
  end if;

  select * into binding from app_private.namespace_bindings b
    where b.family=family_value and b.scope_kind=scope_kind_value
      and b.scope_id=scope_id_value and b.target_kind=target_kind_value
      and b.target_id=target_id_value;
  if app_private.namespace_binding_projection_valid(
    family_value,scope_kind_value,scope_id_value,target_kind_value,target_id_value,
    binding.current_name,binding.canonical_key
  ) is not true then
    raise exception 'resource_namespace_projection_mismatch' using errcode='23514';
  end if;
  end loop;
  return null;
end
$function$;
revoke all on function app_private.enforce_resource_namespace_projection()
  from public, anon, authenticated, line_app;

create constraint trigger account_login_namespace_projection_complete
after insert or update or delete on app_private.account_logins
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger enterprise_slug_namespace_projection_complete
after insert or update or delete on app_private.enterprises
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger repository_name_namespace_projection_complete
after insert or update or delete on app_private.repositories
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger organization_team_slug_namespace_projection_complete
after insert or update or delete on app_private.teams
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger enterprise_team_slug_namespace_projection_complete
after insert or update or delete on app_private.enterprise_teams
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger repository_label_namespace_projection_complete
after insert or update or delete on app_private.repository_labels
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger issue_type_namespace_projection_complete
after insert or update or delete on app_private.issue_types
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger discussion_category_namespace_projection_complete
after insert or update or delete on app_private.discussion_categories
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger project_field_namespace_projection_complete
after insert or update or delete on app_private.project_fields
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger field_option_namespace_projection_complete
after insert or update or delete on app_private.project_field_options
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();
create constraint trigger project_view_namespace_projection_complete
after insert or update or delete on app_private.project_views
deferrable initially deferred for each row execute function app_private.enforce_resource_namespace_projection();

create function app_private.enforce_repository_name_history_projection()
returns trigger
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  row_data jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner_id text;
begin
  select owner_account_id into owner_id from app_private.repositories
    where id=row_data->>'repository_id';
  if found and not app_private.repository_alias_projection_valid(
    owner_id,row_data->>'repository_id',lower(row_data->>'old_name')
  ) then
    raise exception 'repository_alias_projection_mismatch' using errcode='23514';
  end if;
  return null;
end
$function$;
revoke all on function app_private.enforce_repository_name_history_projection()
  from public, anon, authenticated, line_app;
create constraint trigger repository_name_history_projection_complete
after insert or update or delete on app_private.repository_name_history
deferrable initially deferred for each row
execute function app_private.enforce_repository_name_history_projection();

-- Read-only reconciliation proves current parity independently of historical snapshot counts.
create function app_private.assert_scoped_identifier_parity()
returns void
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if exists(
    select 1 from app_private.namespace_bindings b
    where app_private.namespace_binding_projection_valid(
      b.family,b.scope_kind,b.scope_id,b.target_kind,b.target_id,b.current_name,b.canonical_key
    ) is not true
  ) then
    raise exception 'namespace_binding_projection_mismatch' using errcode='23514';
  end if;
  if exists(
    with expected(family,scope_kind,scope_id,target_kind,target_id) as (
      select 'account-login','GLOBAL','global',account_kind,account_id from app_private.account_logins
      union all select 'enterprise-slug','GLOBAL','global','ENTERPRISE',account_id from app_private.enterprises where slug is not null
      union all select 'repository-name','OWNER_ACCOUNT',owner_account_id,'REPOSITORY',id from app_private.repositories
      union all select 'organization-team-slug','ORGANIZATION',organization_account_id,'TEAM',id from app_private.teams
      union all select 'enterprise-team-slug','ENTERPRISE',enterprise_account_id,'ENTERPRISE_TEAM',id from app_private.enterprise_teams
      union all select 'repository-label','REPOSITORY',repository_id,'LABEL',id from app_private.repository_labels
      union all select 'organization-issue-type','ORGANIZATION',organization_account_id,'ISSUE_TYPE',id from app_private.issue_types where deleted_at is null
      union all select 'discussion-category','REPOSITORY',repository_id,'DISCUSSION_CATEGORY',id from app_private.discussion_categories
      union all select 'project-field','PROJECT',project_id,'PROJECT_FIELD',id from app_private.project_fields
      union all select 'field-option','PROJECT_FIELD',field_id,'FIELD_OPTION',id from app_private.project_field_options
      union all select 'project-view','PROJECT',project_id,'PROJECT_VIEW',id from app_private.project_views
    )
    select 1 from expected e where not exists(
      select 1 from app_private.namespace_bindings b
      where b.family=e.family and b.scope_kind=e.scope_kind and b.scope_id=e.scope_id
        and b.target_kind=e.target_kind and b.target_id=e.target_id and b.current_name is not null
    )
  ) then
    raise exception 'resource_namespace_projection_mismatch' using errcode='23514';
  end if;
  if exists(
    with expected(family,scope_kind,scope_id,resource_kind,resource_id,number) as (
      select 'repository-work-item','REPOSITORY',repository_id,'ISSUE',id,number from app_private.issues
      union all select 'repository-discussion','REPOSITORY',repository_id,'DISCUSSION',id,number from app_private.discussions where number is not null
      union all select 'repository-milestone','REPOSITORY',repository_id,'MILESTONE',id,number from app_private.repository_milestones
      union all select 'account-project',owner_account_kind,owner_account_id,'PROJECT',id,number from app_private.projects where number is not null
      union all select 'project-view','PROJECT',project_id,'PROJECT_VIEW',id,number from app_private.project_views
    )
    select 1 from expected e where not exists(
      select 1 from app_private.number_allocations a
      where a.family=e.family and a.scope_kind=e.scope_kind and a.scope_id=e.scope_id
        and a.resource_kind=e.resource_kind and a.resource_id=e.resource_id and a.number=e.number
    )
  ) then
    raise exception 'resource_number_projection_mismatch' using errcode='23514';
  end if;
  if exists(
    select 1 from app_private.number_series s
    where (select count(*) from app_private.number_allocations a
      where a.family=s.family and a.scope_kind=s.scope_kind and a.scope_id=s.scope_id
        and a.number>=s.managed_from and a.number<s.next_number) <> s.next_number-s.managed_from
      or exists(select 1 from app_private.number_allocations a
        where a.family=s.family and a.scope_kind=s.scope_kind and a.scope_id=s.scope_id
          and (a.number>=s.next_number
            or (a.provenance='IMPORTED' and a.number>=s.managed_from)
            or (a.provenance='MANAGED' and a.number<s.managed_from)))
  ) then
    raise exception 'number_series_allocation_parity_mismatch' using errcode='23514';
  end if;
  if exists(
    select 1 from app_private.repository_name_history h
    join app_private.repositories r on r.id=h.repository_id
    where app_private.repository_alias_projection_valid(r.owner_account_id,h.repository_id,lower(h.old_name)) is not true
  ) or exists(
    select 1 from app_private.namespace_claims c where c.claim_kind='ALIAS' and (
      c.family<>'repository-name' or not exists(
        select 1 from app_private.repository_name_history h
        join app_private.repositories r on r.id=h.repository_id
        where r.owner_account_id=c.scope_id and h.repository_id=c.target_id and lower(h.old_name)=c.canonical_key
      )
    )
  ) then
    raise exception 'repository_alias_projection_mismatch' using errcode='23514';
  end if;
end
$function$;
revoke all on function app_private.assert_scoped_identifier_parity()
  from public, anon, authenticated, line_app;
