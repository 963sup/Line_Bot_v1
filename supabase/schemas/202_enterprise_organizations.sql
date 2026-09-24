-- Enterprise-owned attachment relationship to Organization.

create table app_private.enterprise_organizations (
  enterprise_account_id text not null references app_private.enterprises(account_id),
  organization_account_id text not null,
  status text not null,
  version integer not null,
  attached_at bigint not null,
  detached_at bigint,
  primary key (enterprise_account_id, organization_account_id),
  constraint enterprise_organizations_status_check check (status in ('active', 'detached')),
  constraint enterprise_organizations_version_check check (version > 0),
  constraint enterprise_organizations_detached_at_check check (
    (status = 'active' and detached_at is null) or
    (status = 'detached' and detached_at is not null)
  )
);
create unique index enterprise_organizations_one_active_enterprise
  on app_private.enterprise_organizations(organization_account_id)
  where status = 'active';


create function app_private.protect_enterprise_organization_identity()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if tg_op = 'DELETE'
     or new.enterprise_account_id is distinct from old.enterprise_account_id
     or new.organization_account_id is distinct from old.organization_account_id
     or new.attached_at is distinct from old.attached_at then
    raise exception 'enterprise_organization_identity_immutable' using errcode = '23514';
  end if;
  return new;
end
$function$;

create trigger enterprise_organization_identity_immutable
before update or delete on app_private.enterprise_organizations
for each row execute function app_private.protect_enterprise_organization_identity();
