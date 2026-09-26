-- Shared RepositoryOwner login relation owned by Account.

-- GitHub-like RepositoryOwner login namespace shared by User and Organization.
create table app_private.account_logins (
  account_id text primary key,
  account_kind text not null,
  login text not null unique,
  updated_at bigint not null,
  constraint account_logins_owner_kind_check check (account_kind in ('USER', 'ORGANIZATION')),
  constraint account_logins_login_check check (
    login = lower(login)
    and length(login) between 1 and 39
    and login ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    and login not in ('admin','api','assistant','attendance','auth','complete','daily-check-in','diary','enterprises','expenses','explore','feedback','google-link','history','home','login','membership','notifications','organizations','orgs','partners','planned','privacy','profile','projects','repositories','search','settings','team','terms','unavailable')
  ),
  constraint account_logins_account_fkey foreign key (account_id, account_kind)
    references app_private.accounts(id, kind)
);
alter table app_private.account_logins enable row level security;
revoke all on app_private.account_logins from public, anon, authenticated, line_app;
grant insert, select, update on app_private.account_logins to line_app;
create policy backend on app_private.account_logins
  as permissive for all to line_app using (true) with check (true);

create function app_private.set_account_login(
  p_account_id text,
  p_account_kind text,
  p_login text,
  p_at bigint
) returns text
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
declare
  normalized text := lower(trim(coalesce(p_login, '')));
begin
  if p_account_kind not in ('USER', 'ORGANIZATION')
     or p_at is null or p_at < 0
     or normalized !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     or length(normalized) not between 1 and 39
     or normalized in ('admin','api','assistant','attendance','auth','complete','daily-check-in','diary','enterprises','expenses','explore','feedback','google-link','history','home','login','membership','notifications','organizations','orgs','partners','planned','privacy','profile','projects','repositories','search','settings','team','terms','unavailable') then
    raise exception 'account_login_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from app_private.accounts
    where id=p_account_id and kind=p_account_kind
  ) then
    raise exception 'account_login_owner_not_found' using errcode = '23503';
  end if;
  insert into app_private.account_logins(account_id,account_kind,login,updated_at)
    values(p_account_id,p_account_kind,normalized,p_at)
  on conflict (account_id) do update
    set login=excluded.login,updated_at=excluded.updated_at
    where account_logins.account_kind=excluded.account_kind;
  return normalized;
end
$function$;
revoke all on function app_private.set_account_login(text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function app_private.set_account_login(text,text,text,bigint) to line_app;
