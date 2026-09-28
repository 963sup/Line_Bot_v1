-- Identity/Access-owned Organization RoleAssignment.

create table app_private.organization_role_assignments (
  organization_account_id text not null references app_private.organizations(account_id),
  user_id text not null references app_private.users(id),
  role text not null,
  status text not null,
  version integer not null,
  user_status_version integer not null,
  granted_at bigint not null,
  primary key (organization_account_id, user_id, role),
  constraint organization_role_assignments_role_check check (role = 'OrganizationOwner'),
  constraint organization_role_assignments_status_check check (status in ('active', 'revoked')),
  constraint organization_role_assignments_version_check check (version > 0),
  constraint organization_role_assignments_user_version_check check (user_status_version > 0)
);


alter table app_private.organization_role_assignments
  add column membership_version integer not null default 1,
  add constraint organization_role_assignments_membership_version_check
    check (membership_version > 0);
