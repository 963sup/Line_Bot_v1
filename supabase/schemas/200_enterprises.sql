-- Enterprise root and direct affiliation source.

create table app_private.enterprises (
  account_id text primary key,
  account_kind text generated always as ('ENTERPRISE'::text) stored,
  name text not null,
  slug text not null unique,
  status text not null,
  version integer not null,
  created_at bigint not null,
  constraint enterprises_name_check check (length(btrim(name)) between 1 and 120),
  constraint enterprises_slug_check check (
    slug = lower(slug)
    and length(slug) between 1 and 39
    and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
  ),
  constraint enterprises_status_check check (status in ('active', 'inactive')),
  constraint enterprises_version_check check (version > 0),
  constraint enterprises_account_identity_fkey foreign key (account_id, account_kind)
    references app_private.accounts(id, kind)
);
