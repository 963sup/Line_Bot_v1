-- Organization direct/effective membership relationships.

create table app_private.organization_memberships (
  organization_account_id text not null references app_private.organizations(account_id),
  user_id text not null references app_private.users(id),
  status text not null,
  version integer not null,
  created_at bigint not null,
  primary key (organization_account_id, user_id),
  constraint organization_memberships_status_check check (status in ('active', 'removed')),
  constraint organization_memberships_version_check check (version > 0)
);

-- Direct Organization membership is one source of the effective membership epoch above.
-- Enterprise Team assignment can provide additional independent sources.
create table app_private.organization_direct_memberships (
  organization_account_id text not null references app_private.organizations(account_id),
  user_id text not null references app_private.users(id),
  status text not null,
  version integer not null,
  created_at bigint not null,
  primary key (organization_account_id, user_id),
  constraint organization_direct_memberships_status_check check (status in ('active', 'removed')),
  constraint organization_direct_memberships_version_check check (version > 0)
);
create index organization_direct_membership_user_lookup
  on app_private.organization_direct_memberships(user_id, organization_account_id);
