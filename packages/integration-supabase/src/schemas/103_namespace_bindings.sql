-- Scoped business-name authority owned by Namespace.

create table app_private.namespace_bindings (
  family text not null,
  profile_version integer not null default 1,
  scope_kind text not null,
  scope_id text not null,
  target_kind text not null,
  target_id text not null,
  current_name text,
  canonical_key text,
  version bigint not null,
  updated_at bigint not null,
  primary key (family,scope_kind,scope_id,target_kind,target_id),
  constraint namespace_bindings_profile_version_check check (profile_version=1),
  constraint namespace_bindings_scope_id_check check (length(scope_id)>0),
  constraint namespace_bindings_target_id_check check (length(target_id)>0),
  constraint namespace_bindings_family_scope_target_check check (
    (family='account-login' and scope_kind='GLOBAL' and scope_id='global' and target_kind in ('USER','ORGANIZATION'))
    or (family='enterprise-slug' and scope_kind='GLOBAL' and scope_id='global' and target_kind='ENTERPRISE')
    or (family='repository-name' and scope_kind='OWNER_ACCOUNT' and target_kind='REPOSITORY')
    or (family='organization-team-slug' and scope_kind='ORGANIZATION' and target_kind='TEAM')
    or (family='enterprise-team-slug' and scope_kind='ENTERPRISE' and target_kind='ENTERPRISE_TEAM')
    or (family='repository-label' and scope_kind='REPOSITORY' and target_kind='LABEL')
    or (family='organization-issue-type' and scope_kind='ORGANIZATION' and target_kind='ISSUE_TYPE')
    or (family='discussion-category' and scope_kind='REPOSITORY' and target_kind='DISCUSSION_CATEGORY')
    or (family='project-field' and scope_kind='PROJECT' and target_kind='PROJECT_FIELD')
    or (family='field-option' and scope_kind='PROJECT_FIELD' and target_kind='FIELD_OPTION')
    or (family='project-view' and scope_kind='PROJECT' and target_kind='PROJECT_VIEW')
  ),
  constraint namespace_bindings_current_pair_check check (
    (current_name is null and canonical_key is null)
    or (current_name is not null and canonical_key is not null)
  ),
  constraint namespace_bindings_version_check check (version>0),
  constraint namespace_bindings_updated_at_check check (updated_at>=0)
);
alter table app_private.namespace_bindings enable row level security;
revoke all on app_private.namespace_bindings from public, anon, authenticated, line_app;

create table app_private.namespace_claims (
  family text not null,
  profile_version integer not null default 1,
  scope_kind text not null,
  scope_id text not null,
  canonical_key text not null,
  claim_kind text not null,
  target_kind text not null,
  target_id text not null,
  name text not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (family,scope_kind,scope_id,canonical_key),
  constraint namespace_claims_binding_fkey
    foreign key (family,scope_kind,scope_id,target_kind,target_id)
    references app_private.namespace_bindings(family,scope_kind,scope_id,target_kind,target_id)
    deferrable initially deferred,
  constraint namespace_claims_profile_version_check check (profile_version=1),
  constraint namespace_claims_family_scope_target_check check (
    (family='account-login' and scope_kind='GLOBAL' and scope_id='global' and target_kind in ('USER','ORGANIZATION'))
    or (family='enterprise-slug' and scope_kind='GLOBAL' and scope_id='global' and target_kind='ENTERPRISE')
    or (family='repository-name' and scope_kind='OWNER_ACCOUNT' and target_kind='REPOSITORY')
    or (family='organization-team-slug' and scope_kind='ORGANIZATION' and target_kind='TEAM')
    or (family='enterprise-team-slug' and scope_kind='ENTERPRISE' and target_kind='ENTERPRISE_TEAM')
    or (family='repository-label' and scope_kind='REPOSITORY' and target_kind='LABEL')
    or (family='organization-issue-type' and scope_kind='ORGANIZATION' and target_kind='ISSUE_TYPE')
    or (family='discussion-category' and scope_kind='REPOSITORY' and target_kind='DISCUSSION_CATEGORY')
    or (family='project-field' and scope_kind='PROJECT' and target_kind='PROJECT_FIELD')
    or (family='field-option' and scope_kind='PROJECT_FIELD' and target_kind='FIELD_OPTION')
    or (family='project-view' and scope_kind='PROJECT' and target_kind='PROJECT_VIEW')
  ),
  constraint namespace_claims_kind_check check (claim_kind in ('CURRENT','ALIAS','RESERVED')),
  constraint namespace_claims_name_check check (length(name)>0),
  constraint namespace_claims_at_check check (created_at>=0 and updated_at>=0)
);
create unique index namespace_claims_one_current_per_target
  on app_private.namespace_claims(family,scope_kind,scope_id,target_kind,target_id)
  where claim_kind='CURRENT';
create index namespace_claims_target
  on app_private.namespace_claims(family,scope_kind,scope_id,target_kind,target_id);
alter table app_private.namespace_claims enable row level security;
revoke all on app_private.namespace_claims from public, anon, authenticated, line_app;

create table app_private.namespace_binding_history (
  history_id bigint generated always as identity primary key,
  family text not null,
  profile_version integer not null default 1,
  scope_kind text not null,
  scope_id text not null,
  target_kind text not null,
  target_id text not null,
  binding_version bigint not null,
  action text not null,
  old_name text,
  new_name text,
  changed_at bigint not null,
  constraint namespace_binding_history_profile_version_check check (profile_version=1),
  constraint namespace_binding_history_version_check check (binding_version>0),
  constraint namespace_binding_history_action_check check (action in ('CLAIM','RENAME','RELEASE','IMPORT')),
  constraint namespace_binding_history_change_check check (
    (action='CLAIM' and old_name is null and new_name is not null)
    or (action='RENAME' and old_name is not null and new_name is not null)
    or (action='RELEASE' and old_name is not null and new_name is null)
    or (action='IMPORT' and old_name is null and new_name is not null)
  ),
  constraint namespace_binding_history_at_check check (changed_at>=0)
);
create unique index namespace_binding_history_target_version
  on app_private.namespace_binding_history(
    family,scope_kind,scope_id,target_kind,target_id,binding_version
  );
alter table app_private.namespace_binding_history enable row level security;
revoke all on app_private.namespace_binding_history from public, anon, authenticated, line_app;

create function app_private.prevent_namespace_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  raise exception 'namespace_history_is_immutable' using errcode='55000';
end
$function$;
revoke all on function app_private.prevent_namespace_history_mutation()
  from public, anon, authenticated, line_app;
create trigger namespace_binding_history_immutable
before update or delete on app_private.namespace_binding_history
for each row execute function app_private.prevent_namespace_history_mutation();

-- Match ECMAScript String.prototype.trim, including WhiteSpace and LineTerminator code points.
create function app_private.namespace_trim(p_value text)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
  select btrim(
    p_value,
    E'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
  )
$function$;
revoke all on function app_private.namespace_trim(text)
  from public, anon, authenticated, line_app;

-- JavaScript validates lengths in UTF-16 code units; supplementary code points count twice.
create function app_private.namespace_utf16_length(p_value text)
returns integer
language sql
immutable
strict
parallel safe
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
  select coalesce(sum(case when ascii(character)>65535 then 2 else 1 end),0)::integer
  from regexp_split_to_table(p_value,'') as characters(character)
$function$;
revoke all on function app_private.namespace_utf16_length(text)
  from public, anon, authenticated, line_app;

create function app_private.namespace_name_profile(
  p_family text,
  p_scope_kind text,
  p_scope_id text,
  p_target_kind text,
  p_name text
) returns table(normalized_name text,canonical_key text)
language plpgsql
immutable
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_trimmed text := app_private.namespace_trim(coalesce(p_name,''));
  v_lower text := lower(v_trimmed);
begin
  if p_family is null or p_scope_kind is null or p_scope_id is null
     or p_target_kind is null or p_name is null or length(p_scope_id)=0 then
    raise exception 'namespace_scope_invalid' using errcode='22023';
  end if;

  if p_family='account-login' then
    if p_scope_kind<>'GLOBAL' or p_scope_id<>'global'
       or p_target_kind not in ('USER','ORGANIZATION')
       or p_name<>v_lower
       or app_private.namespace_utf16_length(v_lower) not between 1 and 39
       or v_lower !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
       or v_lower in ('admin','api','assistant','attendance','auth','complete','daily-check-in','diary','enterprises','expenses','explore','feedback','google-link','history','home','issues','login','membership','notifications','organizations','orgs','partners','planned','privacy','profile','projects','pulls','repositories','search','settings','sponsors','stars','team','terms','trending','unavailable') then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select v_lower,v_lower;
  elsif p_family='enterprise-slug' then
    if p_scope_kind<>'GLOBAL' or p_scope_id<>'global' or p_target_kind<>'ENTERPRISE'
       or p_name<>v_lower or app_private.namespace_utf16_length(v_lower) not between 1 and 39
       or v_lower !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select v_lower,v_lower;
  elsif p_family='repository-name' then
    if p_scope_kind<>'OWNER_ACCOUNT' or p_target_kind<>'REPOSITORY'
       or p_name<>v_trimmed or app_private.namespace_utf16_length(p_name) not between 1 and 100 then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select p_name,lower(p_name);
  elsif p_family in ('organization-team-slug','enterprise-team-slug') then
    if (p_family='organization-team-slug' and (p_scope_kind<>'ORGANIZATION' or p_target_kind<>'TEAM'))
       or (p_family='enterprise-team-slug' and (p_scope_kind<>'ENTERPRISE' or p_target_kind<>'ENTERPRISE_TEAM'))
       or p_name<>v_lower or p_name<>normalize(p_name,NFKC)
       or app_private.namespace_utf16_length(p_name) not between 1 and 80
       or p_name !~ '^[[:alnum:]]+(-[[:alnum:]]+)*$' then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select p_name,p_name;
  elsif p_family='repository-label' then
    if p_scope_kind<>'REPOSITORY' or p_target_kind<>'LABEL'
       or app_private.namespace_utf16_length(app_private.namespace_trim(p_name)) not between 1 and 50 then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select p_name,p_name;
  elsif p_family='organization-issue-type' then
    if p_scope_kind<>'ORGANIZATION' or p_target_kind<>'ISSUE_TYPE'
       or p_name<>v_trimmed or app_private.namespace_utf16_length(p_name) not between 1 and 120 then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select p_name,lower(p_name);
  elsif p_family='discussion-category' then
    if p_scope_kind<>'REPOSITORY' or p_target_kind<>'DISCUSSION_CATEGORY'
       or p_name<>v_lower or app_private.namespace_utf16_length(p_name) not between 1 and 120
       or p_name !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select p_name,p_name;
  elsif p_family in ('project-field','field-option','project-view') then
    if (p_family='project-field' and (p_scope_kind<>'PROJECT' or p_target_kind<>'PROJECT_FIELD'))
       or (p_family='field-option' and (p_scope_kind<>'PROJECT_FIELD' or p_target_kind<>'FIELD_OPTION'))
       or (p_family='project-view' and (p_scope_kind<>'PROJECT' or p_target_kind<>'PROJECT_VIEW'))
       or app_private.namespace_utf16_length(app_private.namespace_trim(p_name)) not between 1 and 120 then
      raise exception 'namespace_name_invalid' using errcode='22023';
    end if;
    return query select p_name,p_name;
  else
    raise exception 'namespace_family_invalid' using errcode='22023';
  end if;
end
$function$;
revoke all on function app_private.namespace_name_profile(text,text,text,text,text)
  from public, anon, authenticated, line_app;

create function app_private.lock_namespace_key(
  p_family text,p_scope_kind text,p_scope_id text,p_key text
) returns void
language plpgsql
volatile
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_family||E'\x1f'||p_scope_kind||E'\x1f'||p_scope_id||E'\x1f'||p_key,0)
  );
end
$function$;
revoke all on function app_private.lock_namespace_key(text,text,text,text)
  from public, anon, authenticated, line_app;

create function app_private.claim_scoped_namespace_name(
  p_family text,p_scope_kind text,p_scope_id text,p_target_kind text,p_target_id text,
  p_name text,p_at bigint
) returns table(target_kind text,target_id text,name text,current_name text,alias boolean)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_name text;
  v_key text;
  v_binding app_private.namespace_bindings%rowtype;
  v_inserted boolean;
  v_row_count bigint;
begin
  if p_target_id is null or length(p_target_id)=0 or p_at is null or p_at<0 then
    raise exception 'namespace_input_invalid' using errcode='22023';
  end if;
  select normalized_name,canonical_key into strict v_name,v_key
    from app_private.namespace_name_profile(p_family,p_scope_kind,p_scope_id,p_target_kind,p_name);
  perform app_private.lock_namespace_key(p_family,p_scope_kind,p_scope_id,v_key);

  insert into app_private.namespace_bindings(
    family,scope_kind,scope_id,target_kind,target_id,current_name,canonical_key,version,updated_at
  ) values(p_family,p_scope_kind,p_scope_id,p_target_kind,p_target_id,v_name,v_key,1,p_at)
  on conflict do nothing;
  get diagnostics v_row_count = row_count;
  v_inserted := v_row_count=1;

  select b.* into strict v_binding from app_private.namespace_bindings b
    where b.family=p_family and b.scope_kind=p_scope_kind and b.scope_id=p_scope_id
      and b.target_kind=p_target_kind and b.target_id=p_target_id
    for update;

  if not v_inserted then
    if v_binding.current_name is not null then
      if v_binding.current_name<>v_name then
        raise exception 'namespace_target_already_bound' using errcode='23505';
      end if;
      return query select p_target_kind,p_target_id,v_name,v_name,false;
      return;
    end if;

    update app_private.namespace_claims c set claim_kind='CURRENT',name=v_name,updated_at=p_at
      where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
        and c.canonical_key=v_key and c.target_kind=p_target_kind and c.target_id=p_target_id
        and c.claim_kind='ALIAS';
    if not found then
      insert into app_private.namespace_claims(
        family,scope_kind,scope_id,canonical_key,claim_kind,target_kind,target_id,name,created_at,updated_at
      ) values(p_family,p_scope_kind,p_scope_id,v_key,'CURRENT',p_target_kind,p_target_id,v_name,p_at,p_at);
    end if;
    update app_private.namespace_bindings b set
      current_name=v_name,canonical_key=v_key,version=version+1,updated_at=p_at
      where b.family=p_family and b.scope_kind=p_scope_kind and b.scope_id=p_scope_id
        and b.target_kind=p_target_kind and b.target_id=p_target_id
      returning * into strict v_binding;
  else
    insert into app_private.namespace_claims(
      family,scope_kind,scope_id,canonical_key,claim_kind,target_kind,target_id,name,created_at,updated_at
    ) values(p_family,p_scope_kind,p_scope_id,v_key,'CURRENT',p_target_kind,p_target_id,v_name,p_at,p_at);
  end if;

  insert into app_private.namespace_binding_history(
    family,scope_kind,scope_id,target_kind,target_id,binding_version,action,old_name,new_name,changed_at
  ) values(p_family,p_scope_kind,p_scope_id,p_target_kind,p_target_id,
    case when v_inserted then 1 else v_binding.version end,'CLAIM',null,v_name,p_at);
  return query select p_target_kind,p_target_id,v_name,v_name,false;
end
$function$;
revoke all on function app_private.claim_scoped_namespace_name(text,text,text,text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function app_private.claim_scoped_namespace_name(text,text,text,text,text,text,bigint)
  to line_app;

create function app_private.rename_scoped_namespace_name(
  p_family text,p_scope_kind text,p_scope_id text,p_target_kind text,p_target_id text,
  p_expected_name text,p_name text,p_at bigint
) returns table(target_kind text,target_id text,name text,current_name text,alias boolean)
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_expected text;
  v_expected_key text;
  v_name text;
  v_key text;
  v_binding app_private.namespace_bindings%rowtype;
begin
  if p_target_id is null or length(p_target_id)=0 or p_at is null or p_at<0 then
    raise exception 'namespace_input_invalid' using errcode='22023';
  end if;
  if p_family='enterprise-slug' then
    raise exception 'namespace_operation_invalid' using errcode='22023';
  end if;
  select normalized_name,canonical_key into strict v_expected,v_expected_key
    from app_private.namespace_name_profile(p_family,p_scope_kind,p_scope_id,p_target_kind,p_expected_name);
  select normalized_name,canonical_key into strict v_name,v_key
    from app_private.namespace_name_profile(p_family,p_scope_kind,p_scope_id,p_target_kind,p_name);
  if v_expected_key<=v_key then
    perform app_private.lock_namespace_key(p_family,p_scope_kind,p_scope_id,v_expected_key);
    if v_expected_key<>v_key then
      perform app_private.lock_namespace_key(p_family,p_scope_kind,p_scope_id,v_key);
    end if;
  else
    perform app_private.lock_namespace_key(p_family,p_scope_kind,p_scope_id,v_key);
    perform app_private.lock_namespace_key(p_family,p_scope_kind,p_scope_id,v_expected_key);
  end if;

  select b.* into v_binding from app_private.namespace_bindings b
    where b.family=p_family and b.scope_kind=p_scope_kind and b.scope_id=p_scope_id
      and b.target_kind=p_target_kind and b.target_id=p_target_id
    for update;
  if not found or v_binding.current_name is distinct from v_expected then
    raise exception 'namespace_binding_stale' using errcode='40001';
  end if;
  if v_name=v_expected then
    return query select p_target_kind,p_target_id,v_name,v_name,false;
    return;
  end if;

  if v_key=v_expected_key then
    update app_private.namespace_claims c set name=v_name,updated_at=p_at
      where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
        and c.canonical_key=v_expected_key and c.claim_kind='CURRENT'
        and c.target_kind=p_target_kind and c.target_id=p_target_id;
  elsif p_family='repository-name' then
    update app_private.namespace_claims c set claim_kind='ALIAS',updated_at=p_at
      where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
        and c.canonical_key=v_expected_key and c.claim_kind='CURRENT'
        and c.target_kind=p_target_kind and c.target_id=p_target_id;
    update app_private.namespace_claims c set claim_kind='CURRENT',name=v_name,updated_at=p_at
      where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
        and c.canonical_key=v_key and c.claim_kind='ALIAS'
        and c.target_kind=p_target_kind and c.target_id=p_target_id;
    if not found then
      insert into app_private.namespace_claims(
        family,scope_kind,scope_id,canonical_key,claim_kind,target_kind,target_id,name,created_at,updated_at
      ) values(p_family,p_scope_kind,p_scope_id,v_key,'CURRENT',p_target_kind,p_target_id,v_name,p_at,p_at);
    end if;
  else
    delete from app_private.namespace_claims c
      where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
        and c.canonical_key=v_expected_key and c.claim_kind='CURRENT'
        and c.target_kind=p_target_kind and c.target_id=p_target_id;
    insert into app_private.namespace_claims(
      family,scope_kind,scope_id,canonical_key,claim_kind,target_kind,target_id,name,created_at,updated_at
    ) values(p_family,p_scope_kind,p_scope_id,v_key,'CURRENT',p_target_kind,p_target_id,v_name,p_at,p_at);
  end if;

  update app_private.namespace_bindings b set current_name=v_name,canonical_key=v_key,
      version=version+1,updated_at=p_at
    where b.family=p_family and b.scope_kind=p_scope_kind and b.scope_id=p_scope_id
      and b.target_kind=p_target_kind and b.target_id=p_target_id
    returning * into strict v_binding;
  insert into app_private.namespace_binding_history(
    family,scope_kind,scope_id,target_kind,target_id,binding_version,action,old_name,new_name,changed_at
  ) values(p_family,p_scope_kind,p_scope_id,p_target_kind,p_target_id,
    v_binding.version,'RENAME',v_expected,v_name,p_at);
  return query select p_target_kind,p_target_id,v_name,v_name,false;
end
$function$;
revoke all on function app_private.rename_scoped_namespace_name(text,text,text,text,text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function app_private.rename_scoped_namespace_name(text,text,text,text,text,text,text,bigint)
  to line_app;

create function app_private.release_scoped_namespace_name(
  p_family text,p_scope_kind text,p_scope_id text,p_target_kind text,p_target_id text,
  p_expected_name text,p_at bigint
) returns void
language plpgsql
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_expected text;
  v_key text;
  v_binding app_private.namespace_bindings%rowtype;
begin
  if p_target_id is null or length(p_target_id)=0 or p_at is null or p_at<0 then
    raise exception 'namespace_input_invalid' using errcode='22023';
  end if;
  if p_family in (
    'account-login','enterprise-slug','repository-name',
    'organization-team-slug','enterprise-team-slug'
  ) then
    raise exception 'namespace_operation_invalid' using errcode='22023';
  end if;
  select normalized_name,canonical_key into strict v_expected,v_key
    from app_private.namespace_name_profile(p_family,p_scope_kind,p_scope_id,p_target_kind,p_expected_name);
  perform app_private.lock_namespace_key(p_family,p_scope_kind,p_scope_id,v_key);
  select * into v_binding from app_private.namespace_bindings
    where family=p_family and scope_kind=p_scope_kind and scope_id=p_scope_id
      and target_kind=p_target_kind and target_id=p_target_id
    for update;
  if not found or v_binding.current_name is distinct from v_expected then
    raise exception 'namespace_binding_stale' using errcode='40001';
  end if;
  delete from app_private.namespace_claims
    where family=p_family and scope_kind=p_scope_kind and scope_id=p_scope_id
      and canonical_key=v_key and claim_kind='CURRENT'
      and target_kind=p_target_kind and target_id=p_target_id;
  update app_private.namespace_bindings set current_name=null,canonical_key=null,
      version=version+1,updated_at=p_at
    where family=p_family and scope_kind=p_scope_kind and scope_id=p_scope_id
      and target_kind=p_target_kind and target_id=p_target_id
    returning * into strict v_binding;
  insert into app_private.namespace_binding_history(
    family,scope_kind,scope_id,target_kind,target_id,binding_version,action,old_name,new_name,changed_at
  ) values(p_family,p_scope_kind,p_scope_id,p_target_kind,p_target_id,
    v_binding.version,'RELEASE',v_expected,null,p_at);
end
$function$;
revoke all on function app_private.release_scoped_namespace_name(text,text,text,text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function app_private.release_scoped_namespace_name(text,text,text,text,text,text,bigint)
  to line_app;

create function app_private.resolve_scoped_namespace_name(
  p_family text,p_scope_kind text,p_scope_id text,p_name text
) returns table(target_kind text,target_id text,name text,current_name text,alias boolean)
language plpgsql
stable
security definer
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  v_name text;
  v_key text;
  v_target_kind text;
begin
  v_target_kind := case p_family
    when 'account-login' then 'USER'
    when 'enterprise-slug' then 'ENTERPRISE'
    when 'repository-name' then 'REPOSITORY'
    when 'organization-team-slug' then 'TEAM'
    when 'enterprise-team-slug' then 'ENTERPRISE_TEAM'
    when 'repository-label' then 'LABEL'
    when 'organization-issue-type' then 'ISSUE_TYPE'
    when 'discussion-category' then 'DISCUSSION_CATEGORY'
    when 'project-field' then 'PROJECT_FIELD'
    when 'field-option' then 'FIELD_OPTION'
    when 'project-view' then 'PROJECT_VIEW'
    else null
  end;
  if p_family='account-login' then
    -- The shared Account family accepts either target kind; validation uses USER only for name rules.
    v_target_kind := 'USER';
  end if;
  select normalized_name,canonical_key into strict v_name,v_key
    from app_private.namespace_name_profile(p_family,p_scope_kind,p_scope_id,v_target_kind,p_name);
  return query
    select c.target_kind,c.target_id,c.name,b.current_name,(c.claim_kind='ALIAS')
    from app_private.namespace_claims c
    join app_private.namespace_bindings b
      on b.family=c.family and b.scope_kind=c.scope_kind and b.scope_id=c.scope_id
      and b.target_kind=c.target_kind and b.target_id=c.target_id
    where c.family=p_family and c.scope_kind=p_scope_kind and c.scope_id=p_scope_id
      and c.canonical_key=v_key and c.claim_kind in ('CURRENT','ALIAS');
end
$function$;
revoke all on function app_private.resolve_scoped_namespace_name(text,text,text,text)
  from public, anon, authenticated;
grant execute on function app_private.resolve_scoped_namespace_name(text,text,text,text)
  to line_app;
