-- Organization aggregate root.

create table app_private.organizations (
  account_id text primary key,
  account_kind text generated always as ('ORGANIZATION'::text) stored,
  name text not null,
  status text not null,
  version integer not null,
  created_at bigint not null,
  constraint organizations_name_check check (length(btrim(name)) between 1 and 120),
  constraint organizations_status_check check (status in ('active', 'inactive')),
  constraint organizations_version_check check (version > 0),
  constraint organizations_account_identity_fkey foreign key (account_id, account_kind)
    references app_private.accounts(id, kind)
);
