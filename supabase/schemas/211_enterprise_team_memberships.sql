-- Enterprise Team membership relationship.

create table app_private.enterprise_team_memberships (
  team_id text not null,
  enterprise_account_id text not null,
  user_id text not null references app_private.users(id),
  status text not null,
  version integer not null,
  joined_at bigint not null,
  primary key (team_id, user_id),
  constraint enterprise_team_memberships_status_check check (status in ('active', 'removed')),
  constraint enterprise_team_memberships_version_check check (version > 0),
  constraint enterprise_team_memberships_team_fkey foreign key (team_id, enterprise_account_id)
    references app_private.enterprise_teams(id, enterprise_account_id)
);
create index enterprise_team_membership_user_lookup
  on app_private.enterprise_team_memberships(user_id, enterprise_account_id, team_id);
create index enterprise_team_membership_scope_lookup
  on app_private.enterprise_team_memberships(team_id, enterprise_account_id);
