-- Database-atomic coordinators spanning multiple owned relations.

-- Runtime provisioning is a narrow privileged capability: a current active User may
-- create a new governance scope and becomes its initial direct participant + Owner.
-- The function is private-schema SECURITY DEFINER because line_app must not receive
-- unrestricted INSERT on non-USER root Accounts.
create function app_private.provision_enterprise_scope(
  p_target_id text,
  p_user_id text,
  p_slug text,
  p_name text,
  p_requested_at bigint
) returns table(target_id text, user_status_version integer, scope_version integer)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_user_status_version integer;
begin
  perform pg_advisory_xact_lock(71020260912::bigint);
  if p_requested_at is null or p_requested_at < 0
     or length(trim(coalesce(p_target_id, ''))) = 0 or p_target_id <> trim(p_target_id)
     or length(trim(coalesce(p_user_id, ''))) = 0 or p_user_id <> trim(p_user_id)
     or length(trim(coalesce(p_name, ''))) not between 1 and 120
     or p_slug is null or p_slug <> lower(trim(p_slug))
     or length(p_slug) not between 1 and 39
     or p_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then
    raise exception 'provision_enterprise_input_invalid' using errcode = '22023';
  end if;

  select status_version into current_user_status_version
    from app_private.users
    where id=p_user_id and status='active'
    for update;
  if not found then
    raise exception 'provision_enterprise_user_not_active' using errcode = '42501';
  end if;
  if exists(select 1 from app_private.accounts where id=p_target_id) then
    raise exception 'provision_enterprise_target_conflict' using errcode = '23505';
  end if;

  insert into app_private.accounts(id,kind,created_at)
    values(p_target_id,'ENTERPRISE',p_requested_at);
  insert into app_private.enterprises(account_id,name,slug,status,version,created_at)
    values(p_target_id,trim(p_name),p_slug,'active',1,p_requested_at);
  insert into app_private.enterprise_direct_affiliations(
    enterprise_account_id,user_id,status,version,created_at
  ) values(p_target_id,p_user_id,'active',1,p_requested_at);
  insert into app_private.enterprise_role_assignments(
    enterprise_account_id,user_id,role,status,version,user_status_version,granted_at
  ) values(p_target_id,p_user_id,'EnterpriseOwner','active',1,current_user_status_version,p_requested_at);

  return query select p_target_id,current_user_status_version,1;
end
$function$;


create function app_private.provision_organization_scope(
  p_target_id text,
  p_user_id text,
  p_login text,
  p_name text,
  p_requested_at bigint
) returns table(target_id text, user_status_version integer, scope_version integer)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_user_status_version integer;
begin
  perform pg_advisory_xact_lock(71020260912::bigint);
  if p_requested_at is null or p_requested_at < 0
     or length(trim(coalesce(p_target_id, ''))) = 0 or p_target_id <> trim(p_target_id)
     or length(trim(coalesce(p_user_id, ''))) = 0 or p_user_id <> trim(p_user_id)
     or length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'provision_organization_input_invalid' using errcode = '22023';
  end if;

  select status_version into current_user_status_version
    from app_private.users
    where id=p_user_id and status='active'
    for update;
  if not found then
    raise exception 'provision_organization_user_not_active' using errcode = '42501';
  end if;
  if exists(select 1 from app_private.accounts where id=p_target_id) then
    raise exception 'provision_organization_target_conflict' using errcode = '23505';
  end if;

  insert into app_private.accounts(id,kind,created_at)
    values(p_target_id,'ORGANIZATION',p_requested_at);
  perform app_private.set_account_login(p_target_id,'ORGANIZATION',p_login,p_requested_at);
  insert into app_private.organizations(account_id,name,status,version,created_at)
    values(p_target_id,trim(p_name),'active',1,p_requested_at);
  insert into app_private.organization_direct_memberships(
    organization_account_id,user_id,status,version,created_at
  ) values(p_target_id,p_user_id,'active',1,p_requested_at);
  insert into app_private.organization_memberships(
    organization_account_id,user_id,status,version,created_at
  ) values(p_target_id,p_user_id,'active',1,p_requested_at);
  insert into app_private.organization_role_assignments(
    organization_account_id,user_id,role,status,version,user_status_version,granted_at,membership_version
  ) values(p_target_id,p_user_id,'OrganizationOwner','active',1,current_user_status_version,p_requested_at,1);

  return query select p_target_id,current_user_status_version,1;
end
$function$;


create function app_private.bootstrap_enterprise(
  p_target_id text,
  p_user_id text,
  p_slug text,
  p_name text,
  p_operator_identity text,
  p_reason text,
  p_evidence text,
  p_request_id uuid,
  p_requested_at bigint
) returns jsonb
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_user_status_version integer;
  prior app_private.governance_bootstrap_receipts%rowtype;
  receipt jsonb;
begin
  if p_request_id is null or p_requested_at is null or p_requested_at < 0
     or length(trim(coalesce(p_target_id, ''))) = 0 or p_target_id <> trim(p_target_id)
     or length(trim(coalesce(p_user_id, ''))) = 0 or p_user_id <> trim(p_user_id)
     or length(trim(coalesce(p_operator_identity, ''))) = 0
     or length(trim(coalesce(p_reason, ''))) not between 1 and 500
     or length(trim(coalesce(p_evidence, ''))) not between 1 and 2000 then
    raise exception 'bootstrap_evidence_invalid' using errcode = '22023';
  end if;

  select status_version into current_user_status_version from app_private.users
    where id = p_user_id and status = 'active' for update;
  if not found then
    raise exception 'bootstrap_user_not_active' using errcode = '42501';
  end if;

  select * into prior from app_private.governance_bootstrap_receipts
    where request_id = p_request_id for update;
  if found then
    if prior.target_kind <> 'ENTERPRISE' or prior.target_id <> p_target_id
       or prior.user_id <> p_user_id
       or prior.result->>'slug' is distinct from p_slug
       or prior.result->>'name' is distinct from trim(p_name)
       or prior.user_status_version <> current_user_status_version
       or prior.operator_identity <> trim(p_operator_identity)
       or prior.reason <> trim(p_reason) or prior.evidence <> trim(p_evidence)
       or prior.requested_at <> p_requested_at then
      raise exception 'bootstrap_request_conflict' using errcode = '23505';
    end if;
    if not exists (select 1 from app_private.enterprises where account_id=p_target_id and status='active')
       or not exists (select 1 from app_private.enterprise_direct_affiliations where enterprise_account_id=p_target_id and user_id=p_user_id and status='active')
       or not exists (select 1 from app_private.enterprise_role_assignments where enterprise_account_id=p_target_id and user_id=p_user_id and role='EnterpriseOwner' and status='active' and user_status_version=current_user_status_version) then
      raise exception 'bootstrap_scope_no_longer_active' using errcode = '42501';
    end if;
    return prior.result;
  end if;

  select p.user_status_version into current_user_status_version
    from app_private.provision_enterprise_scope(p_target_id,p_user_id,p_slug,p_name,p_requested_at) p;
  receipt := jsonb_build_object('requestId',p_request_id,'targetId',p_target_id,'targetKind','ENTERPRISE','userId',p_user_id,'slug',p_slug,'name',trim(p_name),'version',1,'status','active');
  insert into app_private.governance_bootstrap_receipts(request_id,target_kind,target_id,user_id,user_status_version,operator_identity,database_session_user,reason,evidence,requested_at,result)
    values(p_request_id,'ENTERPRISE',p_target_id,p_user_id,current_user_status_version,trim(p_operator_identity),session_user,trim(p_reason),trim(p_evidence),p_requested_at,receipt);
  return receipt;
end
$function$;


create function app_private.bootstrap_organization(
  p_target_id text,
  p_user_id text,
  p_login text,
  p_name text,
  p_operator_identity text,
  p_reason text,
  p_evidence text,
  p_request_id uuid,
  p_requested_at bigint
) returns jsonb
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_user_status_version integer;
  prior app_private.governance_bootstrap_receipts%rowtype;
  receipt jsonb;
begin
  if p_request_id is null or p_requested_at is null or p_requested_at < 0
     or length(trim(coalesce(p_target_id, ''))) = 0 or p_target_id <> trim(p_target_id)
     or length(trim(coalesce(p_user_id, ''))) = 0 or p_user_id <> trim(p_user_id)
     or length(trim(coalesce(p_operator_identity, ''))) = 0
     or length(trim(coalesce(p_reason, ''))) not between 1 and 500
     or length(trim(coalesce(p_evidence, ''))) not between 1 and 2000 then
    raise exception 'bootstrap_evidence_invalid' using errcode = '22023';
  end if;

  select status_version into current_user_status_version from app_private.users
    where id = p_user_id and status = 'active' for update;
  if not found then
    raise exception 'bootstrap_user_not_active' using errcode = '42501';
  end if;

  select * into prior from app_private.governance_bootstrap_receipts
    where request_id = p_request_id for update;
  if found then
    if prior.target_kind <> 'ORGANIZATION' or prior.target_id <> p_target_id
       or prior.user_id <> p_user_id
       or prior.result->>'login' is distinct from p_login
       or prior.result->>'name' is distinct from trim(p_name)
       or prior.user_status_version <> current_user_status_version
       or prior.operator_identity <> trim(p_operator_identity)
       or prior.reason <> trim(p_reason) or prior.evidence <> trim(p_evidence)
       or prior.requested_at <> p_requested_at then
      raise exception 'bootstrap_request_conflict' using errcode = '23505';
    end if;
    if not exists (select 1 from app_private.organizations where account_id=p_target_id and status='active')
       or not exists (select 1 from app_private.organization_direct_memberships where organization_account_id=p_target_id and user_id=p_user_id and status='active')
       or not exists (select 1 from app_private.organization_memberships where organization_account_id=p_target_id and user_id=p_user_id and status='active')
       or not exists (select 1 from app_private.organization_role_assignments where organization_account_id=p_target_id and user_id=p_user_id and role='OrganizationOwner' and status='active' and user_status_version=current_user_status_version) then
      raise exception 'bootstrap_scope_no_longer_active' using errcode = '42501';
    end if;
    return prior.result;
  end if;

  select p.user_status_version into current_user_status_version
    from app_private.provision_organization_scope(p_target_id,p_user_id,p_login,p_name,p_requested_at) p;
  receipt := jsonb_build_object('requestId',p_request_id,'targetId',p_target_id,'targetKind','ORGANIZATION','userId',p_user_id,'login',p_login,'name',trim(p_name),'version',1,'status','active');
  insert into app_private.governance_bootstrap_receipts(request_id,target_kind,target_id,user_id,user_status_version,operator_identity,database_session_user,reason,evidence,requested_at,result)
    values(p_request_id,'ORGANIZATION',p_target_id,p_user_id,current_user_status_version,trim(p_operator_identity),session_user,trim(p_reason),trim(p_evidence),p_requested_at,receipt);
  return receipt;
end
$function$;


create function app_private.refresh_organization_membership(
  p_organization_account_id text,
  p_user_id text,
  p_at bigint
) returns table(membership_status text, membership_version integer)
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_membership app_private.organization_memberships%rowtype;
  has_source boolean;
begin
  if p_at is null or p_at < 0 then
    raise exception 'organization_membership_refresh_time_invalid' using errcode = '22023';
  end if;

  select exists(
    select 1 from app_private.organization_membership_sources s
    where s.organization_account_id = p_organization_account_id
      and s.user_id = p_user_id
  ) into has_source;

  select * into current_membership
    from app_private.organization_memberships
    where organization_account_id = p_organization_account_id
      and user_id = p_user_id
    for update;

  if has_source then
    if not found then
      return query
        insert into app_private.organization_memberships(
          organization_account_id,user_id,status,version,created_at
        ) values(p_organization_account_id,p_user_id,'active',1,p_at)
        returning status,version;
    end if;
    if current_membership.status = 'removed' then
      return query
        update app_private.organization_memberships
        set status='active',version=version+1,created_at=p_at
        where organization_account_id=p_organization_account_id
          and user_id=p_user_id
        returning status,version;
    end if;
    return query select current_membership.status,current_membership.version;
    return;
  end if;

  if found and current_membership.status = 'active' then
    return query
      update app_private.organization_memberships
      set status='removed',version=version+1
      where organization_account_id=p_organization_account_id
        and user_id=p_user_id
      returning status,version;
    return;
  end if;
  if found then
    return query select current_membership.status,current_membership.version;
  end if;
end
$function$;



-- Repository creation is a narrow privileged coordinator because line_app intentionally has
-- no unrestricted INSERT on repositories or repository_access.
create function app_private.provision_repository(
  p_repository_id text,
  p_actor_user_id text,
  p_owner_account_id text,
  p_owner_account_kind text,
  p_name text
) returns table(repository_id text, owner_login text)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if length(trim(coalesce(p_repository_id, ''))) = 0
     or p_repository_id <> trim(p_repository_id)
     or length(p_repository_id) > 128
     or length(trim(coalesce(p_actor_user_id, ''))) = 0
     or p_actor_user_id <> trim(p_actor_user_id)
     or length(p_actor_user_id) > 128
     or length(trim(coalesce(p_owner_account_id, ''))) = 0
     or p_owner_account_id <> trim(p_owner_account_id)
     or length(p_owner_account_id) > 128
     or p_owner_account_kind not in ('USER','ORGANIZATION')
     or p_name is null or p_name <> trim(p_name)
     or length(p_name) not between 1 and 100 then
    raise exception 'provision_repository_input_invalid' using errcode = '22023';
  end if;

  perform 1 from app_private.users
    where id=p_actor_user_id and status='active'
    for update;
  if not found then
    raise exception 'provision_repository_actor_not_active' using errcode = '42501';
  end if;

  if p_owner_account_kind='USER' then
    if p_owner_account_id <> p_actor_user_id then
      raise exception 'provision_repository_user_owner_forbidden' using errcode = '42501';
    end if;
    perform 1 from app_private.accounts
      where id=p_owner_account_id and kind='USER'
      for share;
    if not found then
      raise exception 'provision_repository_user_owner_missing' using errcode = '42501';
    end if;
  else
    perform 1
      from app_private.organizations o
      join app_private.organization_memberships m
        on m.organization_account_id=o.account_id
       and m.user_id=p_actor_user_id
      join app_private.organization_role_assignments r
        on r.organization_account_id=o.account_id
       and r.user_id=p_actor_user_id
       and r.role='OrganizationOwner'
      join app_private.users u on u.id=p_actor_user_id
      where o.account_id=p_owner_account_id
        and o.status='active'
        and m.status='active'
        and u.status='active'
        and r.status='active'
        and r.user_status_version=u.status_version
        and r.membership_version=m.version
      for share of o,m,r,u;
    if not found then
      raise exception 'provision_repository_organization_owner_forbidden' using errcode = '42501';
    end if;
  end if;

  perform 1 from app_private.account_logins
    where account_id=p_owner_account_id and account_kind=p_owner_account_kind
    for share;
  if not found then
    raise exception 'provision_repository_owner_login_missing' using errcode = '42501';
  end if;

  insert into app_private.repositories(
    id,owner_account_id,owner_account_kind,name,visibility,version
  ) values(
    p_repository_id,p_owner_account_id,p_owner_account_kind,p_name,'private',1
  );

  if p_owner_account_kind='ORGANIZATION' then
    insert into app_private.repository_access(repository_id,principal_id,capability,version)
      values(p_repository_id,p_actor_user_id,'admin',1);
  end if;

  return query
    select p_repository_id,l.login
    from app_private.account_logins l
    where l.account_id=p_owner_account_id and l.account_kind=p_owner_account_kind;
end
$function$;
