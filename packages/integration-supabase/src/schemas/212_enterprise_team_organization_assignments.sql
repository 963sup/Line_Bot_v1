-- Enterprise Team → Organization assignment relationship.

create table app_private.enterprise_team_organizations (
  team_id text not null,
  enterprise_account_id text not null,
  organization_account_id text not null,
  status text not null,
  version integer not null,
  assigned_at bigint not null,
  detached_at bigint,
  primary key (team_id, organization_account_id),
  constraint enterprise_team_organizations_status_check check (status in ('active', 'detached')),
  constraint enterprise_team_organizations_version_check check (version > 0),
  constraint enterprise_team_organizations_detached_at_check check (
    (status = 'active' and detached_at is null) or
    (status = 'detached' and detached_at is not null)
  ),
  constraint enterprise_team_organizations_team_fkey foreign key (team_id, enterprise_account_id)
    references app_private.enterprise_teams(id, enterprise_account_id),
  constraint enterprise_team_organizations_enterprise_organization_fkey
    foreign key (enterprise_account_id, organization_account_id)
    references app_private.enterprise_organizations(enterprise_account_id, organization_account_id)
);
create index enterprise_team_organization_lookup
  on app_private.enterprise_team_organizations(organization_account_id, enterprise_account_id, team_id);
create index enterprise_team_organization_team_scope_lookup
  on app_private.enterprise_team_organizations(team_id, enterprise_account_id);
create index enterprise_team_organization_enterprise_scope_lookup
  on app_private.enterprise_team_organizations(enterprise_account_id, organization_account_id);
