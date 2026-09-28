-- Enterprise-owned direct affiliation relationship.

-- Direct Enterprise participation is an affiliation source, not an Enterprise membership.
-- A directly affiliated user can still be unaffiliated with every Organization.
create table app_private.enterprise_direct_affiliations (
  enterprise_account_id text not null references app_private.enterprises(account_id),
  user_id text not null references app_private.users(id),
  status text not null,
  version integer not null,
  created_at bigint not null,
  primary key (enterprise_account_id, user_id),
  constraint enterprise_direct_affiliations_status_check check (status in ('active', 'removed')),
  constraint enterprise_direct_affiliations_version_check check (version > 0)
);
create index enterprise_direct_affiliation_user_lookup
  on app_private.enterprise_direct_affiliations(user_id, enterprise_account_id);
