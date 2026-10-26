-- Enterprise invitation is a pending request, not affiliation.

-- Invitation is a pending request. It is not membership/affiliation until accepted.
create table app_private.enterprise_invitations (
  enterprise_account_id text not null references app_private.enterprises(account_id),
  user_id text not null references app_private.users(id),
  status text not null,
  version integer not null,
  created_at bigint not null,
  resolved_at bigint,
  primary key (enterprise_account_id, user_id),
  constraint enterprise_invitations_status_check check (status in ('pending', 'accepted', 'cancelled', 'declined')),
  constraint enterprise_invitations_version_check check (version > 0),
  constraint enterprise_invitations_resolution_check check (
    (status = 'pending' and resolved_at is null) or
    (status in ('accepted', 'cancelled', 'declined') and resolved_at is not null)
  )
);
create index enterprise_invitation_user_lookup
  on app_private.enterprise_invitations(user_id, enterprise_account_id);

