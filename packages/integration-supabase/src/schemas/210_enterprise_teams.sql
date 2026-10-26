-- Enterprise Team aggregate root.

-- Enterprise-level teams are distinct from Organization Teams.

-- Enterprise Teams are Enterprise-level groups, distinct from Organization Teams.
create table app_private.enterprise_teams (
  id text not null,
  enterprise_account_id text not null references app_private.enterprises(account_id),
  name text not null,
  slug text not null,
  version integer not null,
  created_by_user_id text not null references app_private.users(id),
  created_at bigint not null,
  primary key (id),
  constraint enterprise_teams_scope_key unique (id, enterprise_account_id),
  constraint enterprise_teams_name_check check (length(trim(name)) between 1 and 80),
  constraint enterprise_teams_slug_check check (
    slug = lower(slug)
    and length(slug) between 1 and 80
    and slug ~ '^[[:alnum:]]+(-[[:alnum:]]+)*$'
  ),
  constraint enterprise_teams_version_check check (version > 0)
);
create index enterprise_team_enterprise_lookup
  on app_private.enterprise_teams(enterprise_account_id, id);
create unique index enterprise_teams_enterprise_slug
  on app_private.enterprise_teams(enterprise_account_id, slug);
create index enterprise_team_creator_lookup
  on app_private.enterprise_teams(created_by_user_id);
create function app_private.protect_enterprise_team_identity()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE'
     or new.id is distinct from old.id
     or new.enterprise_account_id is distinct from old.enterprise_account_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'enterprise_team_identity_immutable' using errcode = '23514';
  end if;
  return new;
end
$function$;

create trigger enterprise_team_identity_immutable
before update or delete on app_private.enterprise_teams
for each row execute function app_private.protect_enterprise_team_identity();
