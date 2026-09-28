-- Global account identity. Runtime may create USER directly; Enterprise/Organization roots use narrow provisioning coordinators.
-- User owns its lifecycle and qualification.
create table app_private.accounts (
  id text primary key,
  kind text not null,
  created_at bigint not null,
  constraint accounts_kind_check check (kind in ('USER', 'ENTERPRISE', 'ORGANIZATION')),
  constraint accounts_id_kind_key unique (id, kind)
);
alter table app_private.accounts enable row level security;
revoke all on app_private.accounts from public, anon, authenticated, line_app;
grant select, insert on app_private.accounts to line_app;
create policy backend_read on app_private.accounts for select to line_app using (true);
create policy backend_insert on app_private.accounts for insert to line_app with check (kind = 'USER');

create function app_private.protect_account_identity()
returns trigger
language plpgsql
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'account_identity_immutable' using errcode = '23514';
  end if;
  if new.id is distinct from old.id
     or new.kind is distinct from old.kind
     or new.created_at is distinct from old.created_at then
    raise exception 'account_identity_immutable' using errcode = '23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_account_identity() from public, anon, authenticated, line_app;
grant execute on function app_private.protect_account_identity() to line_app;
create trigger account_identity_immutable
before update or delete on app_private.accounts
for each row execute function app_private.protect_account_identity();
