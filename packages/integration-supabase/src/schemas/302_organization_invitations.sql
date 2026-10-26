-- Organization invitation is a pending request, not membership.

create table app_private.organization_invitations (
  organization_account_id text not null references app_private.organizations(account_id),
  user_id text not null references app_private.users(id),
  status text not null,
  version integer not null,
  created_at bigint not null,
  resolved_at bigint,
  primary key (organization_account_id, user_id),
  constraint organization_invitations_status_check check (status in ('pending', 'accepted', 'cancelled', 'declined')),
  constraint organization_invitations_version_check check (version > 0),
  constraint organization_invitations_resolution_check check (
    (status = 'pending' and resolved_at is null) or
    (status in ('accepted', 'cancelled', 'declined') and resolved_at is not null)
  )
);
create index organization_invitation_user_lookup
  on app_private.organization_invitations(user_id, organization_account_id);

