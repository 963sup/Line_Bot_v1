-- Database-atomic coordinators spanning multiple owned relations.

-- Release calls this only after the compatible exact-SHA production deployment is read back.
-- A failed deployment leaves the durable runtime write fence closed; retries never reseed facts.
create function app_private.activate_scoped_identifier_runtime(p_revision text,p_at bigint)
returns jsonb
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  marker app_private.scoped_identifier_authority%rowtype;
begin
  if p_revision is null or p_revision !~ '^[0-9a-f]{40}$'
     or p_at is null or p_at not between 0 and 9007199254740991 then
    raise exception 'scoped_identifier_runtime_input_invalid' using errcode='22023';
  end if;
  perform app_private.lock_governance('exclusive');
  select * into marker from app_private.scoped_identifier_authority
    where authority='scoped-identifiers-v1' for update;
  if not found then
    raise exception 'scoped_identifier_authority_missing' using errcode='23514';
  end if;
  perform app_private.assert_scoped_identifier_parity();
  if not marker.runtime_ready then
    update app_private.scoped_identifier_authority
      set runtime_ready=true,runtime_revision=p_revision,runtime_activated_at=p_at
      where authority=marker.authority returning * into marker;
  end if;
  return jsonb_build_object(
    'authority',marker.authority,'revision',marker.revision,'activatedAt',marker.activated_at,
    'runtimeReady',marker.runtime_ready,'runtimeRevision',marker.runtime_revision,
    'runtimeActivatedAt',marker.runtime_activated_at,'counts',app_private.scoped_identifier_counts()
  );
end
$function$;
revoke all on function app_private.activate_scoped_identifier_runtime(text,bigint)
  from public, anon, authenticated, line_app;

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
  perform app_private.lock_governance('exclusive');
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
  perform app_private.claim_scoped_namespace_name(
    'enterprise-slug','GLOBAL','global','ENTERPRISE',p_target_id,p_slug,p_requested_at
  );
  insert into app_private.enterprise_direct_affiliations(
    enterprise_account_id,user_id,status,version,created_at
  ) values(p_target_id,p_user_id,'active',1,p_requested_at);
  insert into app_private.enterprise_role_assignments(
    enterprise_account_id,user_id,role,status,version,user_status_version,granted_at
  ) values(p_target_id,p_user_id,'EnterpriseOwner','active',1,current_user_status_version,p_requested_at);

  return query select p_target_id,current_user_status_version,1;
end
$function$;


-- Operator-only atomic cutover from the retained resource projections into Numbering and
-- Namespace authority. It is deliberately not granted to line_app and never reseeds an
-- already activated authority.
create function app_private.scoped_identifier_counts()
returns jsonb
language sql
stable
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
  select jsonb_build_object(
    'numberSeries',(select count(*) from app_private.number_series),
    'numberAllocations',(select count(*) from app_private.number_allocations),
    'namespaceBindings',(select count(*) from app_private.namespace_bindings),
    'namespaceClaims',(select count(*) from app_private.namespace_claims),
    'namespaceHistory',(select count(*) from app_private.namespace_binding_history)
  )
$function$;
revoke all on function app_private.scoped_identifier_counts()
  from public, anon, authenticated, line_app;

create function app_private.cutover_scoped_identifiers(
  p_revision text,
  p_at bigint
) returns jsonb
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  marker app_private.scoped_identifier_authority%rowtype;
  counts jsonb;
  collision_count bigint;
begin
  if p_revision is null or p_revision !~ '^[0-9a-f]{40}$'
     or p_at is null or p_at not between 0 and 9007199254740991 then
    raise exception 'scoped_identifier_cutover_input_invalid' using errcode='22023';
  end if;

  perform app_private.lock_governance('exclusive');
  lock table app_private.account_logins in access exclusive mode;
  lock table app_private.discussion_categories in access exclusive mode;
  lock table app_private.discussions in access exclusive mode;
  lock table app_private.enterprise_teams in access exclusive mode;
  lock table app_private.enterprises in access exclusive mode;
  lock table app_private.issue_types in access exclusive mode;
  lock table app_private.issues in access exclusive mode;
  lock table app_private.namespace_binding_history in access exclusive mode;
  lock table app_private.namespace_bindings in access exclusive mode;
  lock table app_private.namespace_claims in access exclusive mode;
  lock table app_private.number_allocations in access exclusive mode;
  lock table app_private.number_series in access exclusive mode;
  lock table app_private.project_commands in access exclusive mode;
  lock table app_private.project_events in access exclusive mode;
  lock table app_private.project_field_options in access exclusive mode;
  lock table app_private.project_fields in access exclusive mode;
  lock table app_private.project_views in access exclusive mode;
  lock table app_private.projects in access exclusive mode;
  lock table app_private.repositories in access exclusive mode;
  lock table app_private.repository_labels in access exclusive mode;
  lock table app_private.repository_milestones in access exclusive mode;
  lock table app_private.repository_name_history in access exclusive mode;
  lock table app_private.scoped_identifier_authority in access exclusive mode;
  lock table app_private.teams in access exclusive mode;

  select * into marker
  from app_private.scoped_identifier_authority
  where authority='scoped-identifiers-v1'
  for update;
  if found then
    perform app_private.assert_scoped_identifier_parity();
    return jsonb_build_object(
      'authority',marker.authority,'revision',marker.revision,'activatedAt',marker.activated_at,
      'counts',app_private.scoped_identifier_counts(),'activationSummary',marker.summary,
      'runtimeReady',marker.runtime_ready,'runtimeRevision',marker.runtime_revision
    );
  end if;

  if exists(select 1 from app_private.number_series)
     or exists(select 1 from app_private.number_allocations)
     or exists(select 1 from app_private.namespace_bindings)
     or exists(select 1 from app_private.namespace_claims)
     or exists(select 1 from app_private.namespace_binding_history) then
    raise exception 'scoped_identifier_cutover_registry_not_empty' using errcode='23514';
  end if;

  -- Never silently discard observable allocation evidence or infer missing receipt metadata.
  if exists(
    select 1 from app_private.project_events e where e.action='create-view' and (
      jsonb_typeof(e.data->'number')='number'
      and case when e.data->>'number' ~ '^[1-9][0-9]*$'
        and length(e.data->>'number')<=10
        then (e.data->>'number')::bigint between 1 and 2147483647 else false end
      and jsonb_typeof(e.data->'viewId')='string' and length(e.data->>'viewId')>0
      and exists(
        select 1 from app_private.project_commands c
        where c.actor=e.actor and c.result->>'action'='create-view'
          and c.result->>'projectId'=e.project_id and c.result->>'version'=e.version::text
          and c.result->'data'=e.data
      )
    ) is not true
  ) then
    raise exception 'scoped_identifier_unverifiable_view_history' using errcode='23514';
  end if;

  -- Preserve the Repository Issue high-water checkpoint even when the highest resource was
  -- removed outside the current model. The other retained resource families preserve their
  -- own tombstones, so their live table maximum is the known legacy checkpoint.
  insert into app_private.number_series(
    family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
  )
  select 'repository-work-item','REPOSITORY',r.id,
    greatest(r.next_issue_number-1,coalesce(max(i.number),0))+1,
    greatest(r.next_issue_number-1,coalesce(max(i.number),0)),
    greatest(r.next_issue_number-1,coalesce(max(i.number),0))+1,p_at,p_at
  from app_private.repositories r
  left join app_private.issues i on i.repository_id=r.id
  group by r.id,r.next_issue_number;

  insert into app_private.number_series(
    family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
  )
  select 'repository-discussion','REPOSITORY',repository_id,max(number)+1,max(number),max(number)+1,p_at,p_at
  from app_private.discussions where number is not null group by repository_id;

  insert into app_private.number_series(
    family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
  )
  select 'repository-milestone','REPOSITORY',repository_id,max(number)+1,max(number),max(number)+1,p_at,p_at
  from app_private.repository_milestones group by repository_id;

  insert into app_private.number_series(
    family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
  )
  select 'account-project',owner_account_kind,owner_account_id,
    max(number)+1,max(number),max(number)+1,p_at,p_at
  from app_private.projects where number is not null
  group by owner_account_kind,owner_account_id;

  with valid_view_events as (
    select e.project_id,(e.data->>'number')::bigint as number
    from app_private.project_events e
    where e.action='create-view'
      and jsonb_typeof(e.data->'number')='number'
      and e.data->>'number' ~ '^[1-9][0-9]*$'
      and length(e.data->>'number')<=10
      and (e.data->>'number')::numeric<=2147483647
      and jsonb_typeof(e.data->'viewId')='string'
      and length(e.data->>'viewId')>0
      and exists (
        select 1 from app_private.project_commands c
        where c.actor=e.actor and c.result->>'action'='create-view'
          and c.result->>'projectId'=e.project_id
          and c.result->>'version'=e.version::text
          and c.result->'data'=e.data
      )
  ), view_high_water as (
    select project_id,max(number::bigint) as number
    from app_private.project_views group by project_id
    union all
    select project_id,max(number) from valid_view_events group by project_id
  )
  insert into app_private.number_series(
    family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
  )
  select 'project-view','PROJECT',project_id,max(number)+1,max(number),max(number)+1,p_at,p_at
  from view_high_water group by project_id;

  insert into app_private.number_allocations(
    family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
  )
  select 'repository-work-item','REPOSITORY',repository_id,number,'ISSUE',id,'IMPORTED',created_at
  from app_private.issues;
  insert into app_private.number_allocations(
    family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
  )
  select 'repository-discussion','REPOSITORY',repository_id,number,'DISCUSSION',id,'IMPORTED',created_at
  from app_private.discussions where number is not null;
  insert into app_private.number_allocations(
    family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
  )
  select 'repository-milestone','REPOSITORY',repository_id,number,'MILESTONE',id,'IMPORTED',created_at
  from app_private.repository_milestones;
  insert into app_private.number_allocations(
    family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
  )
  select 'account-project',owner_account_kind,owner_account_id,number,'PROJECT',id,'IMPORTED',created_at
  from app_private.projects where number is not null;
  insert into app_private.number_allocations(
    family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
  )
  select 'project-view','PROJECT',project_id,number,'PROJECT_VIEW',id,'IMPORTED',created_at
  from app_private.project_views;

  -- Current business names are imported as version-one bindings. IMPORT records the known
  -- cutover provenance; it does not invent a historical actor or rename timeline.
  insert into app_private.namespace_bindings(
    family,scope_kind,scope_id,target_kind,target_id,current_name,canonical_key,version,updated_at
  )
  select 'account-login','GLOBAL','global',account_kind,account_id,login,lower(login),1,updated_at
    from app_private.account_logins
  union all
  select 'enterprise-slug','GLOBAL','global','ENTERPRISE',account_id,slug,lower(slug),1,p_at
    from app_private.enterprises where slug is not null
  union all
  select 'repository-name','OWNER_ACCOUNT',owner_account_id,'REPOSITORY',id,name,lower(name),1,p_at
    from app_private.repositories
  union all
  select 'organization-team-slug','ORGANIZATION',organization_account_id,'TEAM',id,slug,slug,1,created_at
    from app_private.teams
  union all
  select 'enterprise-team-slug','ENTERPRISE',enterprise_account_id,'ENTERPRISE_TEAM',id,slug,slug,1,created_at
    from app_private.enterprise_teams
  union all
  select 'repository-label','REPOSITORY',repository_id,'LABEL',id,name,name,1,p_at
    from app_private.repository_labels
  union all
  select 'organization-issue-type','ORGANIZATION',organization_account_id,'ISSUE_TYPE',id,name,lower(name),1,created_at
    from app_private.issue_types where deleted_at is null
  union all
  select 'discussion-category','REPOSITORY',repository_id,'DISCUSSION_CATEGORY',id,slug,slug,1,created_at
    from app_private.discussion_categories
  union all
  select 'project-field','PROJECT',project_id,'PROJECT_FIELD',id,name,name,1,created_at
    from app_private.project_fields
  union all
  select 'field-option','PROJECT_FIELD',field_id,'FIELD_OPTION',id,name,name,1,p_at
    from app_private.project_field_options
  union all
  select 'project-view','PROJECT',project_id,'PROJECT_VIEW',id,name,name,1,created_at
    from app_private.project_views;

  insert into app_private.namespace_claims(
    family,scope_kind,scope_id,canonical_key,claim_kind,target_kind,target_id,name,created_at,updated_at
  )
  select family,scope_kind,scope_id,canonical_key,'CURRENT',target_kind,target_id,current_name,
    updated_at,updated_at
  from app_private.namespace_bindings where current_name is not null;

  insert into app_private.namespace_claims(
    family,scope_kind,scope_id,canonical_key,claim_kind,target_kind,target_id,name,created_at,updated_at
  )
  select 'repository-name','OWNER_ACCOUNT',r.owner_account_id,lower(h.old_name),'ALIAS',
    'REPOSITORY',h.repository_id,h.old_name,h.renamed_at,h.renamed_at
  from app_private.repository_name_history h
  join app_private.repositories r on r.id=h.repository_id
  where not exists(
    select 1 from app_private.namespace_claims c
    where c.family='repository-name' and c.scope_kind='OWNER_ACCOUNT'
      and c.scope_id=r.owner_account_id and c.canonical_key=lower(h.old_name)
      and c.target_kind='REPOSITORY' and c.target_id=h.repository_id
  );

  insert into app_private.namespace_binding_history(
    family,scope_kind,scope_id,target_kind,target_id,binding_version,
    action,old_name,new_name,changed_at
  )
  select family,scope_kind,scope_id,target_kind,target_id,version,
    'IMPORT',null,current_name,p_at
  from app_private.namespace_bindings;

  with valid_view_events as (
    select e.project_id,(e.data->>'number')::bigint as number,e.data->>'viewId' as view_id
    from app_private.project_events e
    where e.action='create-view'
      and jsonb_typeof(e.data->'number')='number'
      and e.data->>'number' ~ '^[1-9][0-9]*$'
      and length(e.data->>'number')<=10
      and (e.data->>'number')::numeric<=2147483647
      and jsonb_typeof(e.data->'viewId')='string'
      and length(e.data->>'viewId')>0
      and exists (
        select 1 from app_private.project_commands c
        where c.actor=e.actor and c.result->>'action'='create-view'
          and c.result->>'projectId'=e.project_id
          and c.result->>'version'=e.version::text
          and c.result->'data'=e.data
      )
  ), known_bindings as (
    select project_id,number,id as view_id from app_private.project_views
    union all
    select project_id,number,view_id from valid_view_events
  )
  select count(*) into collision_count
  from (
    select project_id,number
    from known_bindings
    group by project_id,number
    having count(distinct view_id)>1
  ) collisions;

  perform app_private.assert_scoped_identifier_parity();
  counts := app_private.scoped_identifier_counts()
    || jsonb_build_object('knownProjectViewHistoryCollisions',collision_count);
  insert into app_private.scoped_identifier_authority(authority,revision,activated_at,summary)
    values('scoped-identifiers-v1',p_revision,p_at,counts);
  return jsonb_build_object(
    'authority','scoped-identifiers-v1',
    'revision',p_revision,
    'activatedAt',p_at,
    'runtimeReady',false,
    'runtimeRevision',null,
    'counts',counts
  );
end
$function$;
revoke all on function app_private.cutover_scoped_identifiers(text,bigint)
  from public, anon, authenticated, line_app;


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
  perform app_private.lock_governance('exclusive');
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
  perform app_private.claim_account_login(p_target_id,'ORGANIZATION',p_login,p_requested_at);
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
      return;
    end if;
    if current_membership.status = 'removed' then
      return query
        update app_private.organization_memberships
        set status='active',version=version+1,created_at=p_at
        where organization_account_id=p_organization_account_id
          and user_id=p_user_id
        returning status,version;
      return;
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
  p_name text,
  p_visibility text
) returns table(repository_id text, owner_login text)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_created_at bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
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
     or length(p_name) not between 1 and 100
     or p_visibility not in ('private','internal','public') then
    raise exception 'provision_repository_input_invalid' using errcode = '22023';
  end if;

  perform app_private.lock_governance('shared');

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
      join app_private.users u on u.id=p_actor_user_id
      join app_private.organization_role_assignments r
        on r.organization_account_id=o.account_id
       and r.user_id=p_actor_user_id
       and r.role='OrganizationOwner'
      where o.account_id=p_owner_account_id
        and o.status='active'
        and m.status='active'
        and u.status='active'
        and r.status='active'
        and r.user_status_version=u.status_version
        and r.membership_version=m.version
      for share of o,m,u,r;
    if not found then
      perform 1
        from app_private.organizations o
        join app_private.organization_memberships m
          on m.organization_account_id=o.account_id
         and m.user_id=p_actor_user_id
        join app_private.users u on u.id=p_actor_user_id
        where o.account_id=p_owner_account_id
          and o.status='active'
          and m.status='active'
          and u.status='active'
          and (
            (p_visibility='public' and o.member_can_create_public_repositories)
            or (p_visibility='private' and o.member_can_create_private_repositories)
            or (p_visibility='internal' and o.member_can_create_internal_repositories)
          )
        for share of o,m,u;
    end if;
    if not found then
      raise exception 'provision_repository_organization_capability_forbidden' using errcode = '42501';
    end if;
  end if;

  perform 1 from app_private.account_logins
    where account_id=p_owner_account_id and account_kind=p_owner_account_kind
    for share;
  if not found then
    raise exception 'provision_repository_owner_login_missing' using errcode = '42501';
  end if;

  if p_visibility='internal' and (
    p_owner_account_kind<>'ORGANIZATION'
    or not exists (
      select 1
      from app_private.repository_internal_scopes s
      where s.organization_account_id=p_owner_account_id
    )
  ) then
    raise exception 'repository_internal_scope_missing'
      using errcode='23514', constraint='repository_internal_scope_missing';
  end if;

  if exists (
    select 1
    from app_private.repository_name_history h
    join app_private.repositories existing_repository
      on existing_repository.id=h.repository_id
    where existing_repository.owner_account_id=p_owner_account_id
      and existing_repository.owner_account_kind=p_owner_account_kind
      and lower(h.old_name)=lower(p_name)
  ) then
    raise exception 'repository_name_history_reserved'
      using errcode='23505', constraint='repository_name_history_reserved';
  end if;

  insert into app_private.repositories(
    id,owner_account_id,owner_account_kind,name,visibility,version
  ) values(
    p_repository_id,p_owner_account_id,p_owner_account_kind,p_name,p_visibility,1
  );
  perform app_private.claim_scoped_namespace_name(
    'repository-name','OWNER_ACCOUNT',p_owner_account_id,'REPOSITORY',p_repository_id,
    p_name,v_created_at
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


-- Repository access mutation is a narrow privileged coordinator because line_app intentionally has
-- read-only access to Repository grant tables. Authorization, current upstream qualification,
-- expected-version mutation and last-effective-admin protection are rechecked atomically here.
create function app_private.mutate_repository_access(
  p_actor_user_id text,
  p_repository_id text,
  p_subject_kind text,
  p_subject_id text,
  p_capability text,
  p_expected_version integer
) returns table(result_capability text, result_version integer)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  current_repository app_private.repositories%rowtype;
  current_capability text;
  current_version integer;
  next_version integer;
begin
  if length(trim(coalesce(p_actor_user_id, ''))) = 0
     or p_actor_user_id <> trim(p_actor_user_id)
     or length(p_actor_user_id) > 128
     or length(trim(coalesce(p_repository_id, ''))) = 0
     or p_repository_id <> trim(p_repository_id)
     or length(p_repository_id) > 128
     or p_subject_kind is null
     or p_subject_kind not in ('USER','TEAM')
     or length(trim(coalesce(p_subject_id, ''))) = 0
     or p_subject_id <> trim(p_subject_id)
     or length(p_subject_id) > 128
     or (p_capability is not null and p_capability not in ('read','triage','triage_plus','write','maintain','admin'))
     or p_expected_version is null
     or p_expected_version < 0 then
    raise exception 'repository_access_input_invalid' using errcode = '22023';
  end if;

  perform app_private.lock_governance('exclusive');

  perform 1
  from app_private.users
  where id=p_actor_user_id and status='active'
  for update;
  if not found then
    raise exception 'repository_access_actor_not_active' using errcode = '42501';
  end if;

  select *
  into current_repository
  from app_private.repositories
  where id=p_repository_id
  for update;
  if not found then
    raise exception 'repository_access_repository_missing' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from app_private.repository_effective_access a
    where a.repository_id=p_repository_id
      and a.user_id=p_actor_user_id
      and 'admin'=any(a.permissions)
  ) then
    raise exception 'repository_access_actor_forbidden' using errcode = '42501';
  end if;

  if p_subject_kind='USER' then
    if current_repository.owner_account_kind='USER'
       and current_repository.owner_account_id=p_subject_id then
      raise exception 'repository_access_user_owner_implicit_admin' using errcode = '23514';
    end if;

    select a.capability,a.version
    into current_capability,current_version
    from app_private.repository_access a
    where a.repository_id=p_repository_id and a.principal_id=p_subject_id
    for update;

    if coalesce(current_version,0) <> p_expected_version then
      raise exception 'repository_access_version_conflict' using errcode = '40001';
    end if;

    if p_capability is null then
      if current_version is null then
        raise exception 'repository_access_grant_missing' using errcode = '23514';
      end if;
      delete from app_private.repository_access
      where repository_id=p_repository_id and principal_id=p_subject_id;
      next_version := null;
    else
      perform 1
      from app_private.users
      where id=p_subject_id and status='active'
      for share;
      if not found then
        raise exception 'repository_access_target_not_active' using errcode = '42501';
      end if;

      -- Direct User grants are Repository-owned. Organization membership is intentionally
      -- not required: an active User without current membership is an outside collaborator.
      -- Membership changes classification, while explicit Repository revoke changes the grant.
      if current_capability is not distinct from p_capability then
        raise exception 'repository_access_unchanged' using errcode = '23514';
      end if;

      if current_version is null then
        insert into app_private.repository_access(
          repository_id,principal_id,capability,version
        ) values(
          p_repository_id,p_subject_id,p_capability,1
        );
        next_version := 1;
      else
        update app_private.repository_access
        set capability=p_capability,version=version+1
        where repository_id=p_repository_id and principal_id=p_subject_id
        returning version into next_version;
      end if;
    end if;
  else
    if current_repository.owner_account_kind<>'ORGANIZATION' then
      raise exception 'repository_access_team_requires_organization_owner' using errcode = '23514';
    end if;

    perform 1
    from app_private.teams
    where id=p_subject_id
      and organization_account_id=current_repository.owner_account_id
    for share;
    if not found then
      raise exception 'repository_access_team_scope_conflict' using errcode = '23503';
    end if;

    select a.capability,a.version
    into current_capability,current_version
    from app_private.repository_team_access a
    where a.repository_id=p_repository_id and a.team_id=p_subject_id
    for update;

    if coalesce(current_version,0) <> p_expected_version then
      raise exception 'repository_access_version_conflict' using errcode = '40001';
    end if;

    if p_capability is null then
      if current_version is null then
        raise exception 'repository_access_grant_missing' using errcode = '23514';
      end if;
      delete from app_private.repository_team_access
      where repository_id=p_repository_id and team_id=p_subject_id;
      next_version := null;
    else
      if current_capability is not distinct from p_capability then
        raise exception 'repository_access_unchanged' using errcode = '23514';
      end if;

      if current_version is null then
        insert into app_private.repository_team_access(
          repository_id,organization_id,team_id,capability,version
        ) values(
          p_repository_id,current_repository.owner_account_id,p_subject_id,p_capability,1
        );
        next_version := 1;
      else
        update app_private.repository_team_access
        set capability=p_capability,version=version+1
        where repository_id=p_repository_id and team_id=p_subject_id
        returning version into next_version;
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from app_private.repository_effective_access a
    where a.repository_id=p_repository_id and 'admin'=any(a.permissions)
  ) then
    raise exception 'repository_access_last_admin' using errcode = '23514';
  end if;

  return query select p_capability,next_version;
end
$function$;
