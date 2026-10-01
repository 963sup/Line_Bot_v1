-- Organization-scoped Team aggregate root.

-- Organization-scoped Teams, typed TeamMemberships, TeamMaintainer assignments and command receipts.
-- Depends on current User and Organization schemas. No browser role can access these tables.

create table app_private.teams (
  id text not null,
  organization_account_id text not null,
  name text not null,
  slug text not null,
  parent_team_id text,
  privacy text default 'SECRET' not null,
  notification_setting text default 'NOTIFICATIONS_DISABLED' not null,
  version integer default 0 not null,
  created_by_user_id text not null,
  created_at bigint not null,
  constraint teams_pkey primary key (id),
  constraint teams_id_organization_key unique (id, organization_account_id),
  constraint teams_name_check check (length(name) between 1 and 80),
  constraint teams_slug_check check (
    slug = lower(slug)
    and length(slug) between 1 and 80
    and slug ~ '^[[:alnum:]]+(-[[:alnum:]]+)*$'
  ),
  constraint teams_parent_not_self_check check (parent_team_id is null or parent_team_id <> id),
  constraint teams_privacy_check check (privacy in ('SECRET', 'VISIBLE')),
  constraint teams_notification_setting_check check (
    notification_setting in ('NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_ENABLED')
  ),
  constraint teams_version_check check (version >= 0),
  constraint teams_organization_fkey foreign key (organization_account_id)
    references app_private.organizations(account_id),
  constraint teams_creator_fkey foreign key (created_by_user_id)
    references app_private.users(id),
  constraint teams_parent_scope_fkey foreign key (parent_team_id, organization_account_id)
    references app_private.teams(id, organization_account_id)
);
create unique index teams_organization_slug
  on app_private.teams(organization_account_id, slug);
alter table app_private.teams enable row level security;
revoke all on app_private.teams from public, anon, authenticated, line_app;
grant insert, select, update on app_private.teams to line_app;
create policy backend on app_private.teams for all to line_app using (true) with check (true);

create function app_private.protect_team_scope()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'team_scope_immutable' using errcode = '23514';
  end if;
  if new.id is distinct from old.id
     or new.organization_account_id is distinct from old.organization_account_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'team_scope_immutable' using errcode = '23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_team_scope() from public, anon, authenticated, line_app;
grant execute on function app_private.protect_team_scope() to line_app;
create trigger team_scope_immutable
before update or delete on app_private.teams
for each row execute function app_private.protect_team_scope();


-- Parent is mutable, but hierarchy remains Organization-local and acyclic. The advisory lock
-- serializes hierarchy rewrites even when a privileged database caller bypasses the application.
create function app_private.protect_team_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  creates_cycle boolean;
begin
  perform pg_advisory_xact_lock(71020260913::bigint);
  if new.parent_team_id is null then
    return new;
  end if;

  with recursive ancestors(id, parent_team_id) as (
    select t.id, t.parent_team_id
    from app_private.teams t
    where t.id = new.parent_team_id
      and t.organization_account_id = new.organization_account_id
    union all
    select t.id, t.parent_team_id
    from app_private.teams t
    join ancestors a on a.parent_team_id = t.id
    where t.organization_account_id = new.organization_account_id
  )
  select exists(select 1 from ancestors where id = new.id) into creates_cycle;

  if creates_cycle then
    raise exception 'team_hierarchy_cycle' using errcode = '23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_team_hierarchy() from public, anon, authenticated, line_app;
grant execute on function app_private.protect_team_hierarchy() to line_app;
create trigger team_hierarchy_guard
before insert or update of parent_team_id on app_private.teams
for each row execute function app_private.protect_team_hierarchy();
