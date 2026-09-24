-- Identity/Access-owned Enterprise RoleAssignment.

create table app_private.enterprise_role_assignments (
  enterprise_account_id text not null references app_private.enterprises(account_id),
  user_id text not null references app_private.users(id),
  role text not null,
  status text not null,
  version integer not null,
  user_status_version integer not null,
  granted_at bigint not null,
  primary key (enterprise_account_id, user_id, role),
  constraint enterprise_role_assignments_role_check check (role = 'EnterpriseOwner'),
  constraint enterprise_role_assignments_status_check check (status in ('active', 'revoked')),
  constraint enterprise_role_assignments_version_check check (version > 0),
  constraint enterprise_role_assignments_user_version_check check (user_status_version > 0)
);
