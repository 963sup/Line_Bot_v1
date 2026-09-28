-- Organization-scoped Team aggregate root.

-- Organization-scoped Teams, typed TeamMemberships, TeamMaintainer assignments and command receipts.
-- Depends on current User and Organization schemas. No browser role can access these tables.

create table app_private.teams (
  id text not null,
  organization_account_id text not null,
  name text not null,
  slug text not null,
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
  constraint teams_version_check check (version >= 0),
  constraint teams_organization_fkey foreign key (organization_account_id)
    references app_private.organizations(account_id),
  constraint teams_creator_fkey foreign key (created_by_user_id)
    references app_private.users(id)
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
